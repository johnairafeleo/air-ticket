-- =============================================================================
-- 0013_admin_by_default.sql
--
-- New accounts are ADMIN by default, and an admin creates projects and invites
-- members to them.
--
-- The obstacle: `role = 'ADMIN'` currently means two different things at once —
--
--   (a) "administers projects"        <- what is wanted as the default
--   (b) "sees every project and every ticket in the database, bypassing
--        membership entirely"          <- must NOT become the default
--
-- Making ADMIN the default without separating these would give every signup
-- full sight of everyone else's data: exactly the problem membership was added
-- to solve.
--
-- So (b) moves to its own flag, `profiles.is_superuser`, which stays false for
-- new accounts. `is_admin()` — called by roughly twenty existing policies — is
-- redefined to read that flag, so every policy keeps working unchanged and the
-- cross-project bypass now belongs to superusers only.
--
-- After this:
--   ADMIN (default)  creates projects, becomes their MANAGER, invites members
--                    and sets their roles. Sees only projects they belong to.
--   is_superuser     operator-level: sees everything, manages accounts and
--                    global roles. Held by existing admins only, granted by
--                    hand.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================

alter table public.profiles
  add column if not exists is_superuser boolean not null default false;

comment on column public.profiles.is_superuser is
  'Operator-level access: bypasses project membership everywhere. NOT granted on signup — see is_admin().';

-- Whoever is an admin today keeps the cross-project access they already had.
-- Runs before the default changes, so it cannot sweep in new signups.
update public.profiles
   set is_superuser = true
 where role = 'ADMIN'
   and is_superuser = false;

create index if not exists profiles_superuser_idx on public.profiles (id)
  where is_superuser = true;


-- =============================================================================
-- is_admin() now means "superuser".
--
-- Redefining it rather than renaming keeps every existing policy and trigger
-- correct without touching them — the meaning was always "may bypass the usual
-- scoping", and only the source of truth changes.
-- =============================================================================

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
      and p.is_superuser
      and p.is_active
  )
$$;

comment on function public.is_admin() is
  'True for operator-level accounts (profiles.is_superuser). Bypasses project membership. Deliberately NOT tied to profiles.role, which defaults to ADMIN.';


-- =============================================================================
-- New accounts are ADMIN.
-- =============================================================================

alter table public.profiles alter column role set default 'ADMIN';

-- handle_new_user() does not name a role, so it picks up the column default.
-- Restated here so the intent is visible at the trigger rather than implied.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), ''),
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture',
      ''
    )), ''),
    -- ADMIN by default: they administer their own projects. This grants no
    -- cross-project access — that is is_superuser, which stays false.
    'ADMIN'
  )
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
-- Profile visibility
--
-- Previously anyone with role AGENT or ADMIN could read every profile. With
-- ADMIN as the default that would let every signup enumerate every account, so
-- it now follows project membership instead: you see yourself, and people you
-- share a project with.
-- =============================================================================

create or replace function public.shares_project_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user
  )
$$;

revoke execute on function public.shares_project_with(uuid) from public;
grant execute on function public.shares_project_with(uuid) to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      id = (select auth.uid())
      or public.is_admin()
      or public.shares_project_with(id)
    )
  );


-- =============================================================================
-- Inviting by email
--
-- Adding a member needs to resolve an address to an account, but profiles are
-- no longer broadly readable — and making them readable again would let anyone
-- enumerate every user.
--
-- This resolves one exact address at a time and returns nothing but an id, so
-- it answers "does this person exist" without exposing a directory.
-- =============================================================================

create or replace function public.find_user_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.email = lower(trim(p_email))::extensions.citext
    and p.is_active
$$;

comment on function public.find_user_by_email(text) is
  'Resolves one exact email to a user id for project invitations. Exact match only — never use it to list or search users.';

revoke execute on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to authenticated;


-- =============================================================================
-- Role changes remain operator-only.
--
-- guard_profile_role_change() calls is_admin(), which now means superuser, so
-- an ordinary ADMIN cannot promote anyone. No change needed here — recorded so
-- the consequence is not discovered by accident.
-- =============================================================================
