-- =============================================================================
-- 0009_project_members.sql
--
-- Per-project membership and per-project roles.
--
-- Until now every active user could see every project, and what you could do
-- was fixed by your global role. From here:
--
--   * You only see a project you are a member of.
--   * Your role IN that project decides what you can do there, so the same
--     person can work the queue on one project and merely raise tickets on
--     another.
--   * The global role shrinks to "system administrator or not". A system ADMIN
--     is a superuser: sees every project, does everything, manages accounts.
--
-- Project roles, and what each can see:
--
--   VIEWER   read-only observer. Sees every ticket in the project, changes
--            nothing. For stakeholders watching progress.
--   MEMBER   a requester. Sees ONLY their own tickets. Raises them, edits them
--            while still OPEN, closes their own resolved ones.
--   AGENT    works the queue. Sees every ticket in the project, changes status,
--            priority, category and schedule, and can claim or release work.
--   MANAGER  everything an agent can do, plus assigning to anyone, editing the
--            project, and managing its membership.
--
-- The VIEWER/MEMBER asymmetry is deliberate and worth stating: a VIEWER sees
-- more than a MEMBER. VIEWER is "read everything, change nothing"; MEMBER is
-- "participate, but only with your own tickets" — requesters should not read
-- each other's tickets.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'project_role' and n.nspname = 'public'
  ) then
    create type public.project_role as enum ('VIEWER', 'MEMBER', 'AGENT', 'MANAGER');
  end if;
end
$$;


create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.project_role not null default 'MEMBER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (project_id, user_id)
);

comment on table public.project_members is
  'Who belongs to a project and what they may do in it. Membership gates visibility; role gates capability.';

create index if not exists project_members_user_idx on public.project_members (user_id);

drop trigger if exists project_members_set_updated_at on public.project_members;
create trigger project_members_set_updated_at
  before update on public.project_members
  for each row
  execute function public.set_updated_at();


-- =============================================================================
-- Authorization helpers
--
-- SECURITY DEFINER with a pinned search_path, as in 0001. They bypass RLS,
-- which is precisely why they can be used inside a policy on project_members
-- without recursing.
-- =============================================================================

create or replace function public.project_role_of(p_project uuid)
returns public.project_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.project_members m
  where m.project_id = p_project
    and m.user_id = (select auth.uid())
$$;

comment on function public.project_role_of(uuid) is
  'The caller''s role in a project, or NULL if they are not a member.';

/** Any access at all: a member of the project, or a system admin. */
create or replace function public.can_view_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or public.project_role_of(p_project) is not null
$$;

/** Works the queue: AGENT, MANAGER, or a system admin. */
create or replace function public.is_project_staff(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
      or public.project_role_of(p_project) in ('AGENT', 'MANAGER')
$$;

/** Administers the project and its membership. */
create or replace function public.can_manage_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or public.project_role_of(p_project) = 'MANAGER'
$$;

revoke execute on function public.project_role_of(uuid) from public;
revoke execute on function public.can_view_project(uuid) from public;
revoke execute on function public.is_project_staff(uuid) from public;
revoke execute on function public.can_manage_project(uuid) from public;

grant execute on function public.project_role_of(uuid) to authenticated;
grant execute on function public.can_view_project(uuid) to authenticated;
grant execute on function public.is_project_staff(uuid) to authenticated;
grant execute on function public.can_manage_project(uuid) to authenticated;


-- =============================================================================
-- Backfill — nobody may lose access to something they can see today.
-- =============================================================================

-- Existing system admins manage every project.
insert into public.project_members (project_id, user_id, role)
select p.id, pr.id, 'MANAGER'::public.project_role
from public.projects p
cross join public.profiles pr
where pr.role = 'ADMIN'
on conflict (project_id, user_id) do nothing;

-- Existing global agents keep queue access everywhere.
insert into public.project_members (project_id, user_id, role)
select p.id, pr.id, 'AGENT'::public.project_role
from public.projects p
cross join public.profiles pr
where pr.role = 'AGENT'
on conflict (project_id, user_id) do nothing;

-- Anyone who has raised a ticket becomes a member of that project, so their own
-- tickets stay reachable.
insert into public.project_members (project_id, user_id, role)
select distinct t.project_id, t.created_by, 'MEMBER'::public.project_role
from public.tickets t
on conflict (project_id, user_id) do nothing;

-- Assignees likewise keep access to work already on their plate.
insert into public.project_members (project_id, user_id, role)
select distinct t.project_id, t.assigned_to, 'AGENT'::public.project_role
from public.tickets t
where t.assigned_to is not null
on conflict (project_id, user_id) do nothing;


-- =============================================================================
-- A new project's creator manages it, so it is never created memberless.
-- =============================================================================

create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    insert into public.project_members (project_id, user_id, role)
    values (new.id, (select auth.uid()), 'MANAGER')
    on conflict (project_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created
  after insert on public.projects
  for each row
  execute function public.handle_new_project();


-- =============================================================================
-- Row Level Security — project_members
-- =============================================================================

alter table public.project_members enable row level security;

-- Members can see who else is in their projects.
drop policy if exists project_members_select on public.project_members;
create policy project_members_select
  on public.project_members
  for select
  to authenticated
  using (public.is_active_user() and public.can_view_project(project_id));

drop policy if exists project_members_insert on public.project_members;
create policy project_members_insert
  on public.project_members
  for insert
  to authenticated
  with check (public.is_active_user() and public.can_manage_project(project_id));

drop policy if exists project_members_update on public.project_members;
create policy project_members_update
  on public.project_members
  for update
  to authenticated
  using (public.is_active_user() and public.can_manage_project(project_id))
  with check (public.is_active_user() and public.can_manage_project(project_id));

drop policy if exists project_members_delete on public.project_members;
create policy project_members_delete
  on public.project_members
  for delete
  to authenticated
  using (public.is_active_user() and public.can_manage_project(project_id));

grant select, insert, update, delete on public.project_members to authenticated;


-- =============================================================================
-- Last-manager guard
--
-- Same shape as the last-admin rule in 0001: a project must always have someone
-- who can administer it, and the advisory lock stops two managers removing each
-- other concurrently and leaving none.
-- =============================================================================

create or replace function public.guard_last_project_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid := coalesce(old.project_id, new.project_id);
  v_others  integer;
begin
  -- Only losing a manager matters.
  if tg_op = 'UPDATE' and not (old.role = 'MANAGER' and new.role <> 'MANAGER') then
    return new;
  end if;
  if tg_op = 'DELETE' and old.role <> 'MANAGER' then
    return old;
  end if;

  -- A cascade from deleting the project itself is legitimate: there is no
  -- project left to leave without a manager. Row triggers still fire during a
  -- cascade, so without this the guard would make projects undeletable.
  if tg_op = 'DELETE'
     and not exists (select 1 from public.projects where id = v_project) then
    return old;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.project_members:last_manager'), hashtext(v_project::text));

  select count(*)
    into v_others
    from public.project_members m
    join public.profiles p on p.id = m.user_id
   where m.project_id = v_project
     and m.role = 'MANAGER'
     and m.user_id <> old.user_id
     and p.is_active;

  if v_others = 0 then
    raise exception 'A project must keep at least one manager'
      using errcode = '42501';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

drop trigger if exists project_members_guard_last_manager on public.project_members;
create trigger project_members_guard_last_manager
  before update or delete on public.project_members
  for each row
  execute function public.guard_last_project_manager();


-- =============================================================================
-- Row Level Security — projects
-- =============================================================================

drop policy if exists projects_select on public.projects;
create policy projects_select
  on public.projects
  for select
  to authenticated
  using (
    public.is_active_user()
    and public.can_view_project(id)
    and (is_active or public.can_manage_project(id))
  );

-- Creating projects stays a system-admin action; the creator trigger then makes
-- them its manager.
drop policy if exists projects_insert on public.projects;
create policy projects_insert
  on public.projects
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists projects_update on public.projects;
create policy projects_update
  on public.projects
  for update
  to authenticated
  using (public.is_active_user() and public.can_manage_project(id))
  with check (public.is_active_user() and public.can_manage_project(id));


-- =============================================================================
-- Row Level Security — tickets
--
-- Visibility now follows the project role, replacing the old global-role rules.
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
      -- VIEWER, AGENT and MANAGER read the whole project.
      or public.project_role_of(project_id) in ('VIEWER', 'AGENT', 'MANAGER')
      -- A MEMBER is a requester: their own tickets only.
      or (
        public.project_role_of(project_id) = 'MEMBER'
        and created_by = (select auth.uid())
      )
    )
  );

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert
  on public.tickets
  for insert
  to authenticated
  with check (
    public.is_active_user()
    and created_by = (select auth.uid())
    -- A VIEWER is read-only, so cannot raise tickets.
    and (
      public.is_admin()
      or public.project_role_of(project_id) in ('MEMBER', 'AGENT', 'MANAGER')
    )
  );

drop policy if exists tickets_update on public.tickets;
create policy tickets_update
  on public.tickets
  for update
  to authenticated
  using (
    public.is_active_user()
    and (
      public.is_admin()
      or public.is_project_staff(project_id)
      or (
        public.project_role_of(project_id) = 'MEMBER'
        and created_by = (select auth.uid())
      )
    )
  )
  with check (
    public.is_active_user()
    and (
      public.is_admin()
      or public.is_project_staff(project_id)
      or (
        public.project_role_of(project_id) = 'MEMBER'
        and created_by = (select auth.uid())
      )
    )
  );


-- =============================================================================
-- Ticket guards, rewritten against the project role.
-- =============================================================================

create or replace function public.guard_ticket_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role  public.project_role;
  v_key   text;
  v_seq   bigint;
begin
  if new.project_id is null then
    raise exception 'A ticket must belong to a project'
      using errcode = '23502';
  end if;

  update public.projects
     set ticket_seq = ticket_seq + 1
   where id = new.project_id
   returning key, ticket_seq into v_key, v_seq;

  if v_key is null then
    raise exception 'Project does not exist' using errcode = '23503';
  end if;

  new.ticket_number := v_key || '-' || v_seq::text;

  -- Service-role / SQL editor is trusted: seeding needs to set columns directly.
  if v_actor is null then
    return new;
  end if;

  new.created_by := v_actor;
  v_role := public.project_role_of(new.project_id);

  -- A requester may not pre-assign, pre-schedule, or start a ticket anywhere
  -- other than the beginning of the workflow. System admins are exempt.
  if not public.is_admin() and coalesce(v_role, 'MEMBER') = 'MEMBER' then
    new.status      := 'OPEN';
    new.assigned_to := null;
    new.start_date  := null;
    new.end_date    := null;
  else
    new.status := coalesce(new.status, 'OPEN');
  end if;

  new.resolved_at := case when new.status = 'RESOLVED' then now() end;
  new.closed_at   := case when new.status = 'CLOSED'   then now() end;

  return new;
end;
$$;

drop trigger if exists tickets_guard_insert on public.tickets;
create trigger tickets_guard_insert
  before insert on public.tickets
  for each row
  execute function public.guard_ticket_insert();


create or replace function public.guard_ticket_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role  public.project_role;
  v_is_owner boolean := old.created_by = (select auth.uid());
begin
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

  -- System admins and project managers have no further restrictions.
  if public.is_admin() or public.can_manage_project(old.project_id) then
    return new;
  end if;

  v_role := public.project_role_of(old.project_id);

  if v_role = 'AGENT' then
    -- Agents may claim or release work, but only a manager hands it to someone
    -- else.
    if new.assigned_to is distinct from old.assigned_to
       and new.assigned_to is not null
       and new.assigned_to <> v_actor then
      raise exception 'Only a project manager can assign a ticket to someone else'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if v_role <> 'MEMBER' then
    -- VIEWER, or not a member at all.
    raise exception 'You do not have permission to change tickets in this project'
      using errcode = '42501';
  end if;

  -- MEMBER from here down: a requester acting on their own ticket.
  if not v_is_owner then
    raise exception 'You can only change your own tickets'
      using errcode = '42501';
  end if;

  if new.priority is distinct from old.priority
     or new.assigned_to is distinct from old.assigned_to
     or new.category_id is distinct from old.category_id
     or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date then
    raise exception 'Only support staff can change priority, category, assignment or scheduling'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'RESOLVED' and new.status = 'CLOSED') then
    raise exception 'You can only close a ticket that has been resolved'
      using errcode = '42501';
  end if;

  if (new.title is distinct from old.title or new.description is distinct from old.description)
     and old.status <> 'OPEN' then
    raise exception 'A ticket can only be edited while it is still open'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_guard_change on public.tickets;
create trigger tickets_guard_change
  before update on public.tickets
  for each row
  execute function public.guard_ticket_change();
