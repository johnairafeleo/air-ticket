-- =============================================================================
-- 0003_dashboard_stats.sql
--
-- Phase 4 (partial): one RPC backing every role's dashboard.
--
-- Idempotent, like 0001 and 0002.
--
-- The key design point: this function is SECURITY INVOKER (the default), so it
-- runs as the caller and the RLS policies on public.tickets apply inside it.
-- That means one query is correct for all three roles without a single role
-- check in the SQL:
--
--   USER   sees only their own tickets   -> counts are their own
--   AGENT  sees assigned + unassigned    -> counts are their queue
--   ADMIN  sees everything               -> counts are organisation-wide
--
-- Returning one jsonb payload keeps the dashboard to a single round trip
-- instead of a dozen count queries.
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
    from (
      select unnest(enum_range(null::public.ticket_status)) status
    ) s
    left join (
      select status, count(*) n from visible group by status
    ) c on c.status = s.status
  ),
  by_priority as (
    select jsonb_object_agg(p.priority, coalesce(c.n, 0)) j
    from (
      select unnest(enum_range(null::public.ticket_priority)) priority
    ) p
    left join (
      select priority, count(*) n from visible group by priority
    ) c on c.priority = p.priority
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
    -- Open work per assignee. Only an admin can see other people's assigned
    -- tickets, so for anyone else this naturally collapses to their own row.
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'email', p.email,
          'count', t.n
        ) order by t.n desc
      ),
      '[]'::jsonb
    ) j
    from (
      select assigned_to, count(*) n
      from visible
      where assigned_to is not null
        and status <> 'CLOSED'
      group by assigned_to
    ) t
    join public.profiles p on p.id = t.assigned_to
  )
  select jsonb_build_object(
    'total',           (select count(*) from visible),
    'open_like',       (select count(*) from visible where status in ('OPEN','IN_PROGRESS','PENDING')),
    'unassigned',      (select count(*) from visible where assigned_to is null and status <> 'CLOSED'),
    'assigned_to_me',  (select count(*) from visible where assigned_to = (select auth.uid()) and status <> 'CLOSED'),
    'created_by_me',   (select count(*) from visible where created_by = (select auth.uid())),
    'urgent',          (select count(*) from visible where priority in ('HIGH','URGENT') and status <> 'CLOSED'),
    'by_status',       (select j from by_status),
    'by_priority',     (select j from by_priority),
    'by_category',     (select j from by_category),
    'workload',        (select j from workload)
  )
$$;

comment on function public.dashboard_stats() is
  'Aggregate ticket counts for the dashboard. SECURITY INVOKER so RLS scopes the numbers to the caller''s role.';

revoke execute on function public.dashboard_stats() from public;
grant execute on function public.dashboard_stats() to authenticated;
