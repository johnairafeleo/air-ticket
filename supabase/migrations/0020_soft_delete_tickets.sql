-- =============================================================================
-- 0020 — Deleting a ticket hides it instead of destroying it.
--
-- 0019 made deletion a real DELETE. This replaces that with `deleted_at`: the
-- row stays, every list/board/dashboard stops counting it, and an operator can
-- bring it back.
--
-- Three things change together, and all three are required — a soft delete with
-- any one of them missing is worse than the hard delete it replaces, because
-- the ticket looks gone in one place and present in another:
--
--   1. the column;
--   2. the DELETE policy goes away, so the API can no longer destroy a row;
--   3. dashboard_stats() stops counting deleted tickets.
--
-- The reads in src/lib/tickets/queries.ts gain `.is('deleted_at', null)`
-- alongside this. That is the part with no database-side safety net: a query
-- added later that forgets the filter will show deleted tickets again. It was
-- weighed against enforcing `deleted_at is null` inside tickets_select, which
-- would make leaks structurally impossible — but that also hides deleted rows
-- from the people who would restore them, leaving no in-app route back. The
-- filter stays in the queries so a "deleted tickets" view remains possible
-- without another policy change.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================

alter table public.tickets
  add column if not exists deleted_at timestamptz;

comment on column public.tickets.deleted_at is
  'Soft delete. Non-null means hidden from every list, board and dashboard count. See 0020.';

-- Almost every query asks for the live tickets of one project, so the index
-- that matters is the partial one over exactly those rows.
create index if not exists tickets_live_idx
  on public.tickets (project_id, status)
  where deleted_at is null;


-- =============================================================================
-- Hard delete is withdrawn.
--
-- Leaving tickets_delete in place would leave a second, contradictory route:
-- the app would soft-delete while anyone with the anon key could still destroy
-- the row outright through PostgREST, which defeats the point of keeping it.
--
-- A genuine purge is still possible with the service role or from the SQL
-- editor, neither of which is subject to RLS. That is the right home for it —
-- destroying a ticket permanently should be an operator action, not a button.
-- =============================================================================

drop policy if exists tickets_delete on public.tickets;


-- =============================================================================
-- guard_ticket_change — authorizes deleting and restoring.
--
-- The rule is the one 0019's policy carried: project administrators may delete
-- any ticket, the creator may delete their own while it is still OPEN.
--
-- The check sits BEFORE the role early-returns, which is the whole subtlety
-- here. An AGENT reaches an unconditional `return new` further down, so a check
-- placed after it would let any agent delete anyone's ticket — quietly granting
-- a permission the previous DELETE policy specifically withheld. Restoring is
-- governed by the same test, since it is the same column moving back.
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

  -- Deleting or restoring. Deliberately ahead of the role checks below.
  if new.deleted_at is distinct from old.deleted_at then
    if not (
      public.can_manage_project(old.project_id)
      or (old.created_by = v_actor and old.status = 'OPEN')
    ) then
      raise exception 'You can only delete your own tickets, and only while they are still open'
        using errcode = '42501';
    end if;
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
-- dashboard_stats — deleted tickets stop counting.
--
-- Identical to the 0016 version but for one predicate on the `visible` CTE.
-- Every figure the function returns is derived from that CTE, so filtering it
-- once covers totals, per-status, per-priority, per-category and workload — no
-- figure can disagree with another about what "deleted" means.
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
      and deleted_at is null
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
