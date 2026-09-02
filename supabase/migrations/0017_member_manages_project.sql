-- =============================================================================
-- 0017 — MEMBER becomes a project administrator, except for membership.
--
-- Previously MEMBER was the requester role: raise a ticket, see only your own,
-- edit it while it was still OPEN. It now does everything a MANAGER does apart
-- from managing people.
--
--   MEMBER gains   read every ticket in the project; edit any of them; change
--                  status, priority, category and scheduling; assign work to
--                  others; be assigned work; edit project settings.
--   MEMBER is still refused  adding or removing members, and changing anyone's
--                  project role.
--
-- Two consequences worth stating plainly before the SQL:
--
--   1. This is retroactive. RLS is evaluated per query, not per row at write
--      time, so every existing MEMBER can see every existing ticket in their
--      projects the moment this runs. Tickets raised privately under the old
--      rule become visible to them. There is no migration of data that can
--      soften that — check who currently holds MEMBER before applying.
--
--   2. MEMBER now outranks AGENT. An AGENT works the queue but cannot touch
--      project settings or assign to others; a MEMBER can do both. The
--      PROJECT_ROLES ordering (VIEWER < MEMBER < AGENT < MANAGER) no longer
--      describes privilege, and `listProjectMembers` still sorts by it. Left
--      as-is because it is what was asked for, but if AGENT is meant to remain
--      the stronger of the two, that is a separate decision to make.
--
-- The mechanism is a split, not a widening. `can_manage_project()` was doing
-- two unrelated jobs — "may administer this project" and "may administer its
-- membership" — and only the first one is supposed to grow. Splitting them
-- first means the membership policies keep their exact meaning while
-- everything else moves.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================


-- =============================================================================
-- The split.
--
-- can_manage_members() is the OLD can_manage_project(), unchanged in meaning.
-- It exists so the project_members policies below keep enforcing MANAGER-only
-- while can_manage_project() moves out from under them.
-- =============================================================================

/** Administers the project's membership: MANAGER, or a system admin. */
create or replace function public.can_manage_members(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or public.project_role_of(p_project) = 'MANAGER'
$$;

comment on function public.can_manage_members(uuid) is
  'May add/remove members and change their roles. MANAGER or system admin only — deliberately narrower than can_manage_project().';

revoke execute on function public.can_manage_members(uuid) from public;
grant execute on function public.can_manage_members(uuid) to authenticated;


/** Administers the project itself: MEMBER, MANAGER, or a system admin. */
create or replace function public.can_manage_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
      or public.project_role_of(p_project) in ('MEMBER', 'MANAGER')
$$;

comment on function public.can_manage_project(uuid) is
  'May administer the project: settings, and assigning work to others. Does NOT include membership — see can_manage_members().';


/** Works the queue: MEMBER, AGENT, MANAGER, or a system admin. */
create or replace function public.is_project_staff(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
      or public.project_role_of(p_project) in ('MEMBER', 'AGENT', 'MANAGER')
$$;


-- =============================================================================
-- Membership stays MANAGER-only.
--
-- Same rules as 0009, repointed at can_manage_members() so that widening
-- can_manage_project() above does not quietly hand membership to every MEMBER.
-- This is the whole reason the split exists.
-- =============================================================================

drop policy if exists project_members_insert on public.project_members;
create policy project_members_insert
  on public.project_members
  for insert
  to authenticated
  with check (public.is_active_user() and public.can_manage_members(project_id));

drop policy if exists project_members_update on public.project_members;
create policy project_members_update
  on public.project_members
  for update
  to authenticated
  using (public.is_active_user() and public.can_manage_members(project_id))
  with check (public.is_active_user() and public.can_manage_members(project_id));

drop policy if exists project_members_delete on public.project_members;
create policy project_members_delete
  on public.project_members
  for delete
  to authenticated
  using (public.is_active_user() and public.can_manage_members(project_id));


-- =============================================================================
-- Tickets — a MEMBER reads the whole project.
--
-- The old policy had a MEMBER branch scoped to `created_by = auth.uid()`. That
-- branch is what made them a requester; removing it is the visibility change
-- called out at the top of this file.
-- =============================================================================

drop policy if exists tickets_select on public.tickets;
create policy tickets_select
  on public.tickets
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      public.is_admin()
      -- Every role except a non-member now reads the whole project. VIEWER is
      -- included as before: read everything, change nothing.
      or public.project_role_of(project_id)
         in ('VIEWER', 'MEMBER', 'AGENT', 'MANAGER')
    )
  );


-- =============================================================================
-- guard_ticket_insert — the requester clamp no longer applies to MEMBER.
--
-- It forced a new ticket to start at OPEN with no dates. A MEMBER is now staff
-- and may schedule work, so the clamp narrows to callers who are not staff at
-- all. In practice tickets_insert already refuses those, so this is defence in
-- depth rather than a live path — kept for exactly that reason.
-- =============================================================================

create or replace function public.guard_ticket_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_key   text;
  v_seq   bigint;
  v_role  public.project_role;
begin
  if new.project_id is null then
    raise exception 'A ticket must belong to a project' using errcode = '23502';
  end if;

  update public.projects
     set ticket_seq = ticket_seq + 1
   where id = new.project_id
   returning key, ticket_seq into v_key, v_seq;

  if v_key is null then
    raise exception 'Project does not exist' using errcode = '23503';
  end if;

  new.ticket_number := v_key || '-' || v_seq::text;

  -- A brand new ticket has no assignee rows yet, whoever is creating it.
  new.assignee_count := 0;

  -- Service-role / SQL editor is trusted: seeding needs to set columns directly.
  if v_actor is null then
    return new;
  end if;

  new.created_by := v_actor;
  v_role := public.project_role_of(new.project_id);

  -- Not staff (VIEWER, or no membership at all): start at the beginning of the
  -- workflow, unscheduled. System admins are exempt.
  if not public.is_admin()
     and (v_role is null or v_role = 'VIEWER') then
    new.status     := 'OPEN';
    new.start_date := null;
    new.end_date   := null;
  else
    new.status := coalesce(new.status, 'OPEN');
  end if;

  new.resolved_at := case when new.status = 'RESOLVED' then now() end;
  new.closed_at   := case when new.status = 'CLOSED'   then now() end;

  return new;
end;
$$;


-- =============================================================================
-- guard_ticket_change — the MEMBER branch is gone.
--
-- can_manage_project() now returns true for MEMBER, so the early return catches
-- them before the old requester rules were ever reached. Rather than leave that
-- code sitting there unreachable — the next person to read it would reasonably
-- believe MEMBER is still restricted — it is deleted outright.
--
-- What remains: identity columns are immutable for everyone, status transitions
-- are validated for everyone, and VIEWER / non-members are refused.
-- =============================================================================

create or replace function public.guard_ticket_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role  public.project_role;
begin
  -- assignee_count is derived, never supplied. Recomputing it here means a
  -- client cannot spoof the unassigned filter, and the sync trigger's own
  -- update lands on the same value.
  new.assignee_count := (
    select count(*) from public.ticket_assignees a where a.ticket_id = old.id
  );

  if new.status is distinct from old.status then
    if not public.can_transition(old.status, new.status) then
      raise exception 'Cannot change ticket status from % to %', old.status, new.status
        using errcode = '22023';
    end if;

    new.resolved_at := case when new.status = 'RESOLVED' then coalesce(old.resolved_at, now()) end;
    new.closed_at   := case when new.status = 'CLOSED'   then coalesce(old.closed_at, now())   end;
  end if;

  if v_actor is null then
    return new;
  end if;

  -- Immutable identity columns. project_id is here because the ticket number
  -- embeds the project key.
  if new.id is distinct from old.id
     or new.ticket_number is distinct from old.ticket_number
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.project_id is distinct from old.project_id then
    raise exception 'Ticket identity fields cannot be changed'
      using errcode = '42501';
  end if;

  -- System admins, project managers and (since 0017) members: unrestricted.
  if public.is_admin() or public.can_manage_project(old.project_id) then
    return new;
  end if;

  v_role := public.project_role_of(old.project_id);

  if v_role = 'AGENT' then
    return new;
  end if;

  -- VIEWER, or not a member at all.
  raise exception 'You do not have permission to change tickets in this project'
    using errcode = '42501';
end;
$$;


-- =============================================================================
-- Assignment — a MEMBER may be assigned work, and may assign it.
--
-- "May assign to others" rides on can_manage_project(), which now includes
-- MEMBER, so ticket_assignees_insert / _delete need no edit for that half. What
-- does need editing is the *target* check: it listed AGENT and MANAGER as the
-- only roles that may receive work, which would let a MEMBER assign everyone
-- except themselves and their peers.
-- =============================================================================

drop policy if exists ticket_assignees_insert on public.ticket_assignees;
create policy ticket_assignees_insert
  on public.ticket_assignees
  for insert
  to authenticated
  with check (
    public.is_active_user()
    and public.project_role_of_user(public.ticket_project(ticket_id), user_id)
        in ('MEMBER', 'AGENT', 'MANAGER')
    and (
      public.can_manage_project(public.ticket_project(ticket_id))
      or (
        public.is_project_staff(public.ticket_project(ticket_id))
        and user_id = (select auth.uid())
      )
    )
  );
