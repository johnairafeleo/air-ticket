-- =============================================================================
-- 0016 — A ticket may be assigned to more than one person.
--
-- Replaces the single `tickets.assigned_to` column with a `ticket_assignees`
-- junction table.
--
-- Why a junction table rather than a uuid[] column:
--   * foreign keys still work, so deleting a profile cannot leave a dangling id
--     inside an array nobody thinks to clean up;
--   * each assignment gets its own row, so who assigned whom and when is
--     recorded rather than inferred;
--   * and — the reason that actually decided it — the permission rule becomes
--     expressible in RLS. "An agent may claim only themselves, a manager may
--     assign anyone" needed a trigger while assignment was a column, because
--     WITH CHECK has no OLD to compare against. One row per assignment turns it
--     into an ordinary INSERT/DELETE policy.
--
-- Authorization is unchanged in substance, just extended to a set:
--   AGENT   — may add or remove ONLY themselves (claim / drop work)
--   MANAGER — may add or remove anyone who is project staff
--   ADMIN   — same as manager, everywhere
--   MEMBER / VIEWER — may not assign at all
-- =============================================================================


-- =============================================================================
-- The junction table.
-- =============================================================================

create table if not exists public.ticket_assignees (
  ticket_id   uuid not null references public.tickets (id)  on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  -- Who did the assigning. Nulled rather than removed when that person is
  -- deleted, so the trail degrades to "someone who no longer exists" instead of
  -- taking the assignment with it.
  assigned_by uuid references public.profiles (id) on delete set null,
  primary key (ticket_id, user_id)
);

-- The primary key covers ticket -> assignees. This covers the other direction,
-- which is "everything assigned to me" — the agent's own queue.
create index if not exists ticket_assignees_user_idx
  on public.ticket_assignees (user_id);


-- =============================================================================
-- Denormalised assignee count on tickets.
--
-- Carried deliberately. "Unassigned" is a first-class filter and a dashboard
-- card, and a NOT EXISTS against a junction table is neither available as a
-- partial index nor expressible in a PostgREST list query alongside the other
-- filters and pagination. A count column keeps both a plain predicate.
--
-- It cannot drift: guard_ticket_change() recomputes it from ticket_assignees on
-- every update, so a client that tries to set it directly has its value
-- overwritten with the truth. That is also why no separate "only the trigger may
-- write this column" flag is needed.
-- =============================================================================

alter table public.tickets
  add column if not exists assignee_count integer not null default 0;


-- =============================================================================
-- Helpers.
--
-- Both are SECURITY DEFINER so that policies ON ticket_assignees can resolve a
-- ticket's project and another user's project role without re-entering the
-- policies being evaluated.
-- =============================================================================

create or replace function public.ticket_project(p_ticket uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.project_id from public.tickets t where t.id = p_ticket
$$;

-- project_role_of() answers for the caller. This answers for an arbitrary user,
-- which is what "may I assign THIS person" needs.
create or replace function public.project_role_of_user(p_project uuid, p_user uuid)
returns public.project_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.project_members m
  where m.project_id = p_project
    and m.user_id = p_user
$$;

revoke execute on function public.ticket_project(uuid) from public;
revoke execute on function public.project_role_of_user(uuid, uuid) from public;
grant execute on function public.ticket_project(uuid) to authenticated;
grant execute on function public.project_role_of_user(uuid, uuid) to authenticated;


-- =============================================================================
-- Backfill, before the old column goes away.
-- =============================================================================

insert into public.ticket_assignees (ticket_id, user_id, assigned_by)
select t.id, t.assigned_to, t.assigned_to
from public.tickets t
where t.assigned_to is not null
on conflict (ticket_id, user_id) do nothing;

update public.tickets t
   set assignee_count = (
     select count(*) from public.ticket_assignees a where a.ticket_id = t.id
   );


-- =============================================================================
-- Keep assignee_count in step with the junction table.
-- =============================================================================

create or replace function public.sync_ticket_assignee_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket uuid := coalesce(new.ticket_id, old.ticket_id);
begin
  -- The WHERE matches nothing when this fires as part of a cascading delete of
  -- the ticket itself, which is exactly right: there is no row left to correct.
  update public.tickets t
     set assignee_count = (
       select count(*) from public.ticket_assignees a where a.ticket_id = v_ticket
     )
   where t.id = v_ticket;

  return null;
end;
$$;

drop trigger if exists ticket_assignees_sync_count on public.ticket_assignees;
create trigger ticket_assignees_sync_count
  after insert or delete on public.ticket_assignees
  for each row execute function public.sync_ticket_assignee_count();


-- =============================================================================
-- Row Level Security.
-- =============================================================================

alter table public.ticket_assignees enable row level security;

-- SELECT: if you can see the ticket, you can see who is on it.
--
-- The EXISTS runs as the caller, NOT through a definer helper, precisely so the
-- tickets policy is what decides. A MEMBER who may only see their own tickets
-- therefore cannot enumerate the assignees of anyone else's.
drop policy if exists ticket_assignees_select on public.ticket_assignees;
create policy ticket_assignees_select
  on public.ticket_assignees
  for select
  to authenticated
  using (
    public.is_active_user()
    and exists (select 1 from public.tickets t where t.id = ticket_id)
  );

-- INSERT: managers assign anyone who works the project; agents claim only
-- themselves. The target must be project staff either way — a viewer or a
-- requester cannot be handed queue work.
drop policy if exists ticket_assignees_insert on public.ticket_assignees;
create policy ticket_assignees_insert
  on public.ticket_assignees
  for insert
  to authenticated
  with check (
    public.is_active_user()
    and public.project_role_of_user(public.ticket_project(ticket_id), user_id)
        in ('AGENT', 'MANAGER')
    and (
      public.can_manage_project(public.ticket_project(ticket_id))
      or (
        public.is_project_staff(public.ticket_project(ticket_id))
        and user_id = (select auth.uid())
      )
    )
  );

-- DELETE: the same rule, minus the "target is staff" requirement — somebody who
-- has since lost their agent role must still be removable from a ticket.
drop policy if exists ticket_assignees_delete on public.ticket_assignees;
create policy ticket_assignees_delete
  on public.ticket_assignees
  for delete
  to authenticated
  using (
    public.is_active_user()
    and (
      public.can_manage_project(public.ticket_project(ticket_id))
      or (
        public.is_project_staff(public.ticket_project(ticket_id))
        and user_id = (select auth.uid())
      )
    )
  );

-- No UPDATE policy. An assignment is added or removed, never edited, which is
-- what keeps assigned_at and assigned_by honest.


-- =============================================================================
-- guard_ticket_insert — as before, without assigned_to.
--
-- A requester could previously pre-assign on create and the trigger nulled it.
-- Assignment is now its own table with its own policy, so there is nothing left
-- to strip: a MEMBER simply cannot insert into ticket_assignees.
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

  -- A brand new ticket has no assignee rows yet, whoever is creating it.
  new.assignee_count := 0;

  -- Service-role / SQL editor is trusted: seeding needs to set columns directly.
  if v_actor is null then
    return new;
  end if;

  new.created_by := v_actor;
  v_role := public.project_role_of(new.project_id);

  -- A requester may not pre-schedule or start a ticket anywhere other than the
  -- beginning of the workflow. System admins are exempt.
  if not public.is_admin() and coalesce(v_role, 'MEMBER') = 'MEMBER' then
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
-- guard_ticket_change — as before, without assigned_to, plus the count recompute.
--
-- The AGENT branch loses its "only a manager hands work to someone else" check,
-- because assignment no longer travels through this table at all. That rule now
-- lives in ticket_assignees_insert / ticket_assignees_delete, unchanged in
-- meaning.
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
  v_is_owner boolean := old.created_by = (select auth.uid());
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

  -- System admins and project managers have no further restrictions.
  if public.is_admin() or public.can_manage_project(old.project_id) then
    return new;
  end if;

  v_role := public.project_role_of(old.project_id);

  if v_role = 'AGENT' then
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


-- =============================================================================
-- dashboard_stats — same shape, counted across the junction table.
--
-- Note that `workload` now counts a ticket once per assignee, so the sum of the
-- workload rows can exceed the number of tickets. That is the honest reading of
-- shared work: it reports what each person actually has on their plate.
-- =============================================================================

create or replace function public.dashboard_stats(p_project_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with visible as (
    -- SECURITY INVOKER means RLS still applies here, so this narrows what the
    -- caller may see; it can never widen it.
    select * from public.tickets
    where project_id = p_project_id
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
      select a.user_id, count(*) n
      from visible v
      join public.ticket_assignees a on a.ticket_id = v.id
      where v.status <> 'CLOSED'
      group by a.user_id
    ) t
    join public.profiles p on p.id = t.user_id
  )
  select jsonb_build_object(
    'total',          (select count(*) from visible),
    'open_like',      (select count(*) from visible where status in ('OPEN','IN_PROGRESS','PENDING')),
    'unassigned',     (select count(*) from visible where assignee_count = 0 and status <> 'CLOSED'),
    'assigned_to_me', (select count(*) from visible v
                        where v.status <> 'CLOSED'
                          and exists (select 1 from public.ticket_assignees a
                                       where a.ticket_id = v.id
                                         and a.user_id = (select auth.uid()))),
    'created_by_me',  (select count(*) from visible where created_by = (select auth.uid())),
    'urgent',         (select count(*) from visible where priority in ('HIGH','URGENT') and status <> 'CLOSED'),
    'by_status',      (select j from by_status),
    'by_priority',    (select j from by_priority),
    'by_category',    (select j from by_category),
    'workload',       (select j from workload)
  )
$$;


-- =============================================================================
-- The old column goes last, once nothing reads it.
-- Dropping it also drops tickets_assigned_to_idx and tickets_unassigned_idx.
-- =============================================================================

alter table public.tickets drop column if exists assigned_to;

-- The agent queue, restated against the count column.
create index if not exists tickets_unassigned_idx
  on public.tickets (created_at desc)
  where assignee_count = 0 and status <> 'CLOSED';
