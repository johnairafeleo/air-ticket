-- =============================================================================
-- 0019 — Tickets can be deleted.
--
-- There was no DELETE policy on public.tickets at all. With RLS enabled that
-- means every delete was refused, silently: PostgREST reports success with zero
-- rows affected rather than an error, so a delete button built without this
-- migration would have looked like it worked and changed nothing.
--
-- Who may delete:
--
--   can_manage_project()  MEMBER, MANAGER and system admins — the same people
--                         who administer the project since 0017.
--   the creator           but only while the ticket is still OPEN. Once an
--                         agent has picked it up, the ticket is part of a
--                         shared workload and is no longer the reporter's to
--                         withdraw.
--
-- This is a hard delete. ticket_assignees cascades (0016 declared the FK that
-- way), and the ticket number is NOT returned to the pool — projects.ticket_seq
-- only ever moves forward, so numbering stays gap-tolerant and unambiguous
-- rather than reusing HOWDEN-7 for a different ticket later.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================

drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete
  on public.tickets
  for delete
  to authenticated
  using (
    public.is_active_user()
    and (
      -- Covers system admins too: can_manage_project() starts with is_admin().
      public.can_manage_project(project_id)
      or (
        created_by = (select auth.uid())
        and status = 'OPEN'
      )
    )
  );

comment on policy tickets_delete on public.tickets is
  'Project administrators may delete any ticket; the creator may delete their own while it is still OPEN. See 0019.';
