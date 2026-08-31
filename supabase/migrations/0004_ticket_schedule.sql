-- =============================================================================
-- 0004_ticket_schedule.sql
--
-- Planned start and end dates for a ticket.
--
-- Idempotent, like the earlier migrations.
--
-- These are *planning* fields, distinct from the automatic lifecycle timestamps
-- (created_at, resolved_at, closed_at) which record what actually happened.
--
-- `date`, not `timestamptz`: a planned day has no meaningful time of day, and
-- storing one would make the same ticket appear to start on different days for
-- users in different timezones.
--
-- They are staff-only, enforced in the same trigger clause as priority,
-- category and assignment — scheduling work is the support desk's job, not the
-- requester's.
-- =============================================================================

alter table public.tickets
  add column if not exists start_date date,
  add column if not exists end_date date;

comment on column public.tickets.start_date is
  'Planned start day. Set by support staff; unrelated to created_at.';
comment on column public.tickets.end_date is
  'Planned completion day. Must not precede start_date.';

-- An end before a start is always a data-entry error, so reject it outright
-- rather than leaving impossible ranges in the table. NULLs are allowed on both
-- sides: a ticket may be scheduled loosely or not at all.
alter table public.tickets
  drop constraint if exists tickets_date_range;

alter table public.tickets
  add constraint tickets_date_range check (
    start_date is null
    or end_date is null
    or end_date >= start_date
  );

-- Supports "what is scheduled to finish soon" lookups.
create index if not exists tickets_end_date_idx
  on public.tickets (end_date)
  where end_date is not null and status <> 'CLOSED';


-- =============================================================================
-- Update the change guard so a requester cannot set their own schedule.
--
-- Same function as 0002 with start_date and end_date added to the USER-branch
-- restriction. Replaced wholesale rather than patched so the file remains the
-- complete definition.
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
  -- Keep the resolution timestamps consistent with status for every caller,
  -- including service-role.
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

  -- Immutable identity columns. Nobody re-numbers or re-parents a ticket.
  if new.id is distinct from old.id
     or new.ticket_number is distinct from old.ticket_number
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Ticket identity fields cannot be changed'
      using errcode = '42501';
  end if;

  if v_role = 'ADMIN' then
    return new;
  end if;

  if v_role = 'AGENT' then
    -- Agents work their own tickets and the unassigned queue.
    if old.assigned_to is not null and old.assigned_to <> v_actor then
      raise exception 'This ticket is assigned to another agent'
        using errcode = '42501';
    end if;
    -- They may claim or release, but not hand work to someone else.
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

  -- The one status change a requester may make: closing a resolved ticket.
  if new.status is distinct from old.status
     and not (old.status = 'RESOLVED' and new.status = 'CLOSED') then
    raise exception 'You can only close a ticket that has been resolved'
      using errcode = '42501';
  end if;

  -- Wording can be corrected while nobody has started work.
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
