-- =============================================================================
-- 0023 — Backfill added_by for Howden PH, and make the column immutable.
--
-- Two unrelated-looking things, both about the same column.
--
-- 1. THE BACKFILL
--
-- 0022 left every pre-existing membership null on the grounds that the
-- information was unrecoverable. That was true of the database and false of the
-- world: the project's manager knows who added whom, and supplied it. These
-- values are that testimony, not an inference — nothing in the schema could
-- have derived them.
--
-- Matched by email rather than uuid so the intent is legible, and written as
-- one statement per relationship so a wrong one can be corrected in isolation.
-- Every update is guarded on `added_by is null`, so re-running this cannot
-- overwrite a value the application has since recorded properly. On a freshly
-- built database none of these emails exist and the whole section is a no-op.
--
-- 2. THE IMMUTABILITY GAP
--
-- 0022 set added_by from a BEFORE INSERT trigger, which left UPDATE unguarded.
-- project_members_update lets a manager change a member's role, and a policy
-- cannot say "this column but not that one" — WITH CHECK has no access to OLD.
-- So a manager could PATCH added_by to name anyone at all, which is precisely
-- the forgery the insert trigger exists to prevent. The trigger below extends
-- to UPDATE and pins the column to its previous value.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================


-- =============================================================================
-- The backfill. Scoped to Howden PH; other projects are untouched.
-- =============================================================================

-- John Aira Feleo was added by third.
update public.project_members pm
   set added_by = (select id from public.profiles where email = 'fsugian@techstacksph.com')
  from public.projects p, public.profiles me
 where p.id = pm.project_id
   and p.key = 'HOWDEN'
   and me.id = pm.user_id
   and me.email = 'johnyscript08@gmail.com'
   and pm.added_by is null;

-- Everyone else was added by John Aira Feleo.
update public.project_members pm
   set added_by = (select id from public.profiles where email = 'johnyscript08@gmail.com')
  from public.projects p, public.profiles them
 where p.id = pm.project_id
   and p.key = 'HOWDEN'
   and them.id = pm.user_id
   and them.email in (
     'techstacks.sam@gmail.com',
     'johndavidauxillos28@gmail.com',
     'aaronalejandria.1802@gmail.com',
     'johnairacruzfeleo@gmail.com'
   )
   and pm.added_by is null;


-- =============================================================================
-- added_by becomes write-once.
-- =============================================================================

create or replace function public.set_project_member_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- Service role and the SQL editor are trusted: seeding, the backfill above,
  -- and any future operator correction all need to write this column directly.
  if v_actor is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.added_by := v_actor;
  else
    -- Write-once. A role change must not be able to rewrite who did the adding.
    new.added_by := old.added_by;
  end if;

  return new;
end;
$$;

comment on function public.set_project_member_actor() is
  'Stamps added_by with the acting user on insert and freezes it on update. Client-supplied values are ignored — see 0022 and 0023.';

drop trigger if exists project_members_set_actor on public.project_members;
create trigger project_members_set_actor
  before insert or update on public.project_members
  for each row
  execute function public.set_project_member_actor();
