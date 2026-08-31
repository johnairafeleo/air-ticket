-- =============================================================================
-- 0008_initial_status.sql
--
-- Let support staff choose a ticket's starting status, so the board can offer a
-- per-column "+" that actually creates the ticket in that column.
--
-- Previously guard_ticket_insert() forced OPEN for every authenticated caller.
-- Adding from the "In progress" column would have silently produced an OPEN
-- ticket that appeared somewhere else — worse than not offering the button.
--
-- Requesters are still pinned to OPEN: choosing where your own ticket starts in
-- someone else's workflow is not a requester's decision, and it matches
-- guard_ticket_change(), which only ever lets them close a resolved ticket.
--
-- Doing this in the insert rather than as a follow-up UPDATE keeps it atomic —
-- a failed second write would otherwise leave a ticket in the wrong column.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================

create or replace function public.guard_ticket_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role  public.user_role;
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

  new.created_by := v_actor;
  v_role := public.current_user_role();

  if v_role = 'USER' then
    -- A requester may not open a ticket pre-assigned, pre-scheduled, or
    -- anywhere other than the start of the workflow.
    new.status      := 'OPEN';
    new.assigned_to := null;
    new.start_date  := null;
    new.end_date    := null;
  else
    new.status := coalesce(new.status, 'OPEN');
  end if;

  -- Keep the lifecycle timestamps consistent with whatever status the ticket is
  -- actually starting in, exactly as guard_ticket_change() does on update.
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
