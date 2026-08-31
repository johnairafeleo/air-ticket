-- =============================================================================
-- 0005_projects.sql
--
-- Projects: every ticket now belongs to one, and ticket numbers are per-project
-- (NET-1, HW-1) instead of one global TKT- sequence.
--
-- Idempotent, like the earlier migrations.
--
-- Scope decisions baked in here:
--
--   * Projects group tickets; they do NOT gate visibility. The RLS policies on
--     tickets are unchanged, so the guards already verified in 0002 still hold.
--     A project_members table can be layered on later without redoing them.
--
--   * project_id is IMMUTABLE after creation. The ticket number embeds the
--     project key, so moving a ticket would either renumber it — breaking any
--     link already shared — or leave a number that contradicts its project.
--
--   * Existing tickets keep their TKT-0000NN numbers. Renumbering history to
--     match a new scheme would invalidate every reference to them.
-- =============================================================================

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  key         text not null,
  name        text not null,
  description text,
  is_active   boolean not null default true,

  -- Per-project ticket counter. Incremented under the row lock that UPDATE
  -- takes, which is what makes concurrent inserts safe without an advisory lock.
  ticket_seq  bigint not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Short, uppercase, alphanumeric — the prefix people will type and read.
  constraint projects_key_format check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  constraint projects_name_length check (char_length(name) between 2 and 80),
  constraint projects_description_length check (
    description is null or char_length(description) <= 500
  )
);

comment on table public.projects is
  'Ticket containers. Each has a key used as the prefix for its own ticket numbering.';

create unique index if not exists projects_key_key on public.projects (key);
create unique index if not exists projects_name_key on public.projects (lower(name));
create index if not exists projects_active_idx on public.projects (name)
  where is_active = true;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();


-- =============================================================================
-- Attach tickets to projects
-- =============================================================================

alter table public.tickets
  add column if not exists project_id uuid references public.projects (id) on delete restrict;

create index if not exists tickets_project_id_idx on public.tickets (project_id);

-- Home for tickets that predate this migration. Created only if some ticket
-- still lacks a project, so a clean database does not get a stray row.
insert into public.projects (key, name, description)
select 'GEN', 'General', 'Tickets raised before projects existed.'
where exists (select 1 from public.tickets where project_id is null)
  and not exists (select 1 from public.projects where key = 'GEN');

update public.tickets
   set project_id = (select id from public.projects where key = 'GEN')
 where project_id is null;

-- Only enforce NOT NULL once every row has a project; running this on a table
-- with orphans would abort the whole migration.
do $$
begin
  if not exists (select 1 from public.tickets where project_id is null) then
    alter table public.tickets alter column project_id set not null;
  end if;
end
$$;


-- =============================================================================
-- Ticket numbering
--
-- The old column default called a single global sequence. Numbers now depend on
-- the project, which is only known per-row, so allocation moves into the insert
-- guard and the default is dropped.
-- =============================================================================

alter table public.tickets alter column ticket_number drop default;

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
begin
  if new.project_id is null then
    raise exception 'A ticket must belong to a project'
      using errcode = '23502';
  end if;

  -- Allocate the next number for this project. The UPDATE takes a row lock, so
  -- concurrent inserts into the same project queue rather than collide.
  -- Callers never supply ticket_number; it is always derived here.
  update public.projects
     set ticket_seq = ticket_seq + 1
   where id = new.project_id
   returning key, ticket_seq into v_key, v_seq;

  if v_key is null then
    raise exception 'Project does not exist' using errcode = '23503';
  end if;

  new.ticket_number := v_key || '-' || v_seq::text;

  -- Service-role / SQL editor (auth.uid() null) is trusted: seeding and admin
  -- tooling need to set the remaining columns directly.
  if v_actor is null then
    return new;
  end if;

  new.created_by  := v_actor;
  new.status      := 'OPEN';
  new.resolved_at := null;
  new.closed_at   := null;

  -- Only agents and admins may open a ticket already assigned to someone.
  if new.assigned_to is not null and public.current_user_role() = 'USER' then
    new.assigned_to := null;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_guard_insert on public.tickets;
create trigger tickets_guard_insert
  before insert on public.tickets
  for each row
  execute function public.guard_ticket_insert();


-- =============================================================================
-- Change guard: project_id is immutable, and staff-only like the other
-- non-wording fields.
--
-- Full replacement of the 0004 version with the project rules added.
-- =============================================================================

create or replace function public.guard_ticket_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role  public.user_role;
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

  v_role := public.current_user_role();

  -- Immutable identity columns. project_id belongs here because the ticket
  -- number embeds the project key.
  if new.id is distinct from old.id
     or new.ticket_number is distinct from old.ticket_number
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.project_id is distinct from old.project_id then
    raise exception 'Ticket identity fields cannot be changed'
      using errcode = '42501';
  end if;

  if v_role = 'ADMIN' then
    return new;
  end if;

  if v_role = 'AGENT' then
    if old.assigned_to is not null and old.assigned_to <> v_actor then
      raise exception 'This ticket is assigned to another agent'
        using errcode = '42501';
    end if;
    if new.assigned_to is distinct from old.assigned_to
       and new.assigned_to is not null
       and new.assigned_to <> v_actor then
      raise exception 'Only an administrator can assign a ticket to someone else'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- USER from here down.
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


-- =============================================================================
-- Row Level Security — projects
--
-- Readable by every active user (you cannot pick a project you cannot see);
-- managed by admins only.
-- =============================================================================

alter table public.projects enable row level security;

drop policy if exists projects_select on public.projects;
create policy projects_select
  on public.projects
  for select
  to authenticated
  using (
    public.is_active_user()
    and (is_active or public.is_admin())
  );

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
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy: projects are deactivated so their tickets keep a home.

grant select on public.projects to authenticated;
grant insert, update on public.projects to authenticated;

-- The insert guard increments projects.ticket_seq as the definer, so no direct
-- UPDATE grant on that column is needed by ordinary users.


-- =============================================================================
-- Dashboard: expose a per-project breakdown alongside the existing figures.
-- =============================================================================

create or replace function public.dashboard_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with visible as (
    select * from public.tickets
  ),
  by_status as (
    select jsonb_object_agg(s.status, coalesce(c.n, 0)) j
    from (select unnest(enum_range(null::public.ticket_status)) status) s
    left join (select status, count(*) n from visible group by status) c
      on c.status = s.status
  ),
  by_priority as (
    select jsonb_object_agg(p.priority, coalesce(c.n, 0)) j
    from (select unnest(enum_range(null::public.ticket_priority)) priority) p
    left join (select priority, count(*) n from visible group by priority) c
      on c.priority = p.priority
  ),
  by_category as (
    select coalesce(
      jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc),
      '[]'::jsonb
    ) j
    from (
      select coalesce(cat.name, 'Uncategorised') name, count(*) n
      from visible v
      left join public.categories cat on cat.id = v.category_id
      group by 1
    ) t
  ),
  by_project as (
    select coalesce(
      jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc),
      '[]'::jsonb
    ) j
    from (
      select coalesce(pr.name, 'No project') name, count(*) n
      from visible v
      left join public.projects pr on pr.id = v.project_id
      group by 1
    ) t
  ),
  workload as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id, 'full_name', p.full_name, 'email', p.email, 'count', t.n
        ) order by t.n desc
      ),
      '[]'::jsonb
    ) j
    from (
      select assigned_to, count(*) n
      from visible
      where assigned_to is not null and status <> 'CLOSED'
      group by assigned_to
    ) t
    join public.profiles p on p.id = t.assigned_to
  )
  select jsonb_build_object(
    'total',          (select count(*) from visible),
    'open_like',      (select count(*) from visible where status in ('OPEN','IN_PROGRESS','PENDING')),
    'unassigned',     (select count(*) from visible where assigned_to is null and status <> 'CLOSED'),
    'assigned_to_me', (select count(*) from visible where assigned_to = (select auth.uid()) and status <> 'CLOSED'),
    'created_by_me',  (select count(*) from visible where created_by = (select auth.uid())),
    'urgent',         (select count(*) from visible where priority in ('HIGH','URGENT') and status <> 'CLOSED'),
    'by_status',      (select j from by_status),
    'by_priority',    (select j from by_priority),
    'by_category',    (select j from by_category),
    'by_project',     (select j from by_project),
    'workload',       (select j from workload)
  )
$$;

revoke execute on function public.dashboard_stats() from public;
grant execute on function public.dashboard_stats() to authenticated;
