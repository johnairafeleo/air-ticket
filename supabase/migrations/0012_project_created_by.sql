-- =============================================================================
-- 0012_project_created_by.sql
--
-- Record who created a project, and let them read the row they just inserted.
--
-- The bug this fixes: `insert into projects ... returning id` failed with "new
-- row violates row-level security policy", even though the insert itself was
-- allowed. Postgres applies the SELECT policy to rows returned by RETURNING,
-- and projects_select requires membership — which the creator does not yet have,
-- because handle_new_project() is an AFTER INSERT trigger and has not run at the
-- point RETURNING is evaluated.
--
-- Adding created_by and admitting it to the SELECT policy closes the gap and is
-- useful provenance in its own right. The alternative — never using RETURNING —
-- is a rule nobody would remember.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================

alter table public.projects
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

comment on column public.projects.created_by is
  'Who created the project. Also lets the creator SELECT the row during INSERT ... RETURNING, before the membership trigger has run.';

-- Set automatically; service-role and SQL-editor inserts leave it null.
alter table public.projects
  alter column created_by set default auth.uid();

-- Backfill from whoever manages each project, oldest membership first.
update public.projects p
   set created_by = (
     select m.user_id
     from public.project_members m
     where m.project_id = p.id and m.role = 'MANAGER'
     order by m.created_at
     limit 1
   )
 where p.created_by is null;

create index if not exists projects_created_by_idx on public.projects (created_by);

drop policy if exists projects_select on public.projects;
create policy projects_select
  on public.projects
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      public.can_view_project(id)
      -- The creator, for the instant between INSERT and the membership trigger.
      or created_by = (select auth.uid())
    )
    and (is_active or public.can_manage_project(id) or created_by = (select auth.uid()))
  );
