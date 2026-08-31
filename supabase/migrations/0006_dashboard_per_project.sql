-- =============================================================================
-- 0006_dashboard_per_project.sql
--
-- The app is always scoped to exactly one project — "All projects" is gone — so
-- the dashboard aggregates have to be scoped too. Previously they counted every
-- ticket the caller could see, which no longer matches what the rest of the
-- page is showing.
--
-- Idempotent, like the earlier migrations.
--
-- Adding a parameter creates a NEW function rather than replacing the old one,
-- so the zero-argument version is dropped explicitly. Leaving it would let a
-- stale caller silently get unscoped, whole-organisation numbers.
--
-- The `by_project` breakdown is also removed: with a single project in scope it
-- would always be one bar at 100%.
-- =============================================================================

drop function if exists public.dashboard_stats();
drop function if exists public.dashboard_stats(uuid);

create function public.dashboard_stats(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
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
    'workload',       (select j from workload)
  )
$$;

comment on function public.dashboard_stats(uuid) is
  'Aggregate ticket counts for one project. SECURITY INVOKER so RLS still scopes the numbers to the caller''s role.';

revoke execute on function public.dashboard_stats(uuid) from public;
grant execute on function public.dashboard_stats(uuid) to authenticated;
