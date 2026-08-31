-- =============================================================================
-- 0007_schedule_on_insert.sql
--
-- Closes an inconsistency between the insert and update guards.
--
-- 0004 made start_date and end_date staff-only, but only in
-- guard_ticket_change(). guard_ticket_insert() never touched them, so a
-- requester could set a schedule at creation time even though they could not
-- change it a second later. Same rule, two different answers depending on when
-- you asked.
--
-- The insert guard now clears both for USER-role callers, exactly as it already
-- did for assigned_to.
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

  new.created_by  := v_actor;
  new.status      := 'OPEN';
  new.resolved_at := null;
  new.closed_at   := null;

  v_role := public.current_user_role();

  -- A requester may not open a ticket pre-assigned or pre-scheduled. Both are
  -- the support desk's decisions, and guard_ticket_change() already refuses to
  -- let a USER alter them afterwards.
  if v_role = 'USER' then
    new.assigned_to := null;
    new.start_date  := null;
    new.end_date    := null;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_guard_insert on public.tickets;
create trigger tickets_guard_insert
  before insert on public.tickets
  for each row
  execute function public.guard_ticket_insert();
