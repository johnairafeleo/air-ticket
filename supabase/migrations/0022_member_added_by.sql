-- =============================================================================
-- 0022 — Record who added each project member.
--
-- `added_by` is an audit field, so the database sets it rather than trusting the
-- caller. The insert policy on project_members constrains WHO may add a member,
-- but nothing stopped the inserted row from naming somebody else as the person
-- who did it — and a membership trail that can be forged is not a trail. The
-- trigger below overwrites whatever arrives with auth.uid(), exactly as
-- guard_ticket_insert() already does for tickets.created_by.
--
-- BREAKING FOR POSTGREST: this makes project_members the second table with two
-- foreign keys to profiles (user_id and added_by). A bare `profiles` embed is
-- now ambiguous and answers 300/PGRST201, so listProjectMembers() must name the
-- constraint explicitly. That change ships with this migration; applying one
-- without the other breaks the Members page.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================

alter table public.project_members
  add column if not exists added_by uuid references public.profiles (id) on delete set null;

comment on column public.project_members.added_by is
  'Who added this member. Forced to auth.uid() by trigger; null means it predates 0022. See 0022.';


create or replace function public.set_project_member_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- Service role and the SQL editor keep what they supplied, so seeding and the
  -- backfill below can write a trail that is not "whoever ran the script".
  if v_actor is null then
    return new;
  end if;

  new.added_by := v_actor;

  return new;
end;
$$;

drop trigger if exists project_members_set_actor on public.project_members;
create trigger project_members_set_actor
  before insert on public.project_members
  for each row
  execute function public.set_project_member_actor();


-- =============================================================================
-- Backfill — only what is provably true.
--
-- A project's creator is made its MANAGER by handle_new_project(), so for that
-- one row we know the answer: they added themselves. Every other existing row
-- stays null, because "we do not know who did this" is the honest value and a
-- plausible guess in an audit column is worse than an admission.
-- =============================================================================

update public.project_members pm
   set added_by = pm.user_id
  from public.projects p
 where p.id = pm.project_id
   and p.created_by = pm.user_id
   and pm.added_by is null;
