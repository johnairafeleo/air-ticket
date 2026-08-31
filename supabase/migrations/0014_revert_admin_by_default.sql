-- =============================================================================
-- 0014_revert_admin_by_default.sql
--
-- Undoes 0013. New accounts are USER again, and ADMIN goes back to meaning
-- operator-level access.
--
-- Written as a forward migration rather than by deleting 0013, so the applied
-- history stays truthful: 0013 really did run against this database, and a
-- clean rebuild has to reach the same end state by the same route.
--
-- What comes back:
--   * profiles.role defaults to USER.
--   * is_admin() reads role = 'ADMIN' again, so the ADMIN role once more
--     carries the cross-project bypass.
--   * Profiles are readable by agents and admins, as before 0013.
--
-- What is deliberately KEPT:
--   * profiles.is_superuser stays as a column. Dropping it would lose the
--     backfill recording who held admin before 0013, and it is harmless unused.
--     Every existing admin has it set, so it can be re-adopted later without
--     guessing.
--   * find_user_by_email() stays. It is a strictly better way to resolve an
--     invitation than reading the profiles table, and removing it would break
--     addProjectMember().
--   * Project membership (0009) and everything after it is untouched.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================

-- Back to operator-level meaning the ADMIN role.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'ADMIN'
      and p.is_active
  )
$$;

comment on function public.is_admin() is
  'True for the ADMIN global role. Bypasses project membership.';

alter table public.profiles alter column role set default 'USER';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    -- Email signup sets full_name; Google may use either key.
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture',
      ''
    )), '')
  )
  -- No role named, so the column default (USER) applies. Signup metadata is
  -- attacker-controlled and must never be able to name a role.
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- =============================================================================
-- Profile visibility, as it was before 0013.
--
-- Safe again now that ADMIN is not the default: only genuine agents and admins
-- can read every profile.
-- =============================================================================

drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      id = (select auth.uid())
      or public.current_user_role() in ('AGENT', 'ADMIN')
    )
  );
