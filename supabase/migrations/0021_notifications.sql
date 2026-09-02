-- =============================================================================
-- 0021 — Notifications for ticket movement and assignment.
--
-- One row per recipient per event. That is deliberately not the cheapest
-- storage — a ticket with four assignees produces four rows for one status
-- change — but it is what makes everything else simple: read state is per
-- person, the inbox is `where user_id = me`, and the Realtime subscription is
-- one channel filtered on a single indexed column. The alternative (one event
-- row plus a join table for read state) buys a little space and costs a join on
-- every read and a far more complicated RLS story.
--
-- Rows are written ONLY by the triggers below, which are SECURITY DEFINER.
-- There is deliberately no INSERT policy, so a client cannot manufacture a
-- notification for someone else — an unauthenticated-looking "your ticket was
-- closed" is a phishing primitive, not just noise.
--
-- Recipients:
--   status change   every assignee, plus the creator
--   assignment      the person assigned
--   unassignment    the person removed
--
-- The actor never notifies themselves. Being told about the thing you just did
-- is the fastest way to teach someone to ignore the bell.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum (
      'STATUS_CHANGED',
      'ASSIGNED',
      'UNASSIGNED'
    );
  end if;
end
$$;

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  -- Who receives it. Cascades: a deleted profile's inbox goes with them.
  user_id     uuid not null references public.profiles (id) on delete cascade,
  ticket_id   uuid not null references public.tickets (id) on delete cascade,
  type        public.notification_type not null,
  -- Who caused it. Nulled rather than removed when that profile is deleted, so
  -- the notification survives as "someone" instead of vanishing.
  actor_id    uuid references public.profiles (id) on delete set null,
  -- Only meaningful for STATUS_CHANGED; null on the assignment types.
  from_status public.ticket_status,
  to_status   public.ticket_status,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- The inbox query: one user's notifications, newest first.
create index if not exists notifications_inbox_idx
  on public.notifications (user_id, created_at desc);

-- The unread badge. Partial, because unread is a small slice of a table that
-- only grows, and the count is read on every page render.
create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;


-- =============================================================================
-- RLS — your own inbox, and nothing else.
-- =============================================================================

drop policy if exists notifications_select on public.notifications;
create policy notifications_select
  on public.notifications
  for select
  to authenticated
  using (public.is_active_user() and user_id = (select auth.uid()));

-- Marking as read. The guard trigger below restricts this to `read_at`, which a
-- policy cannot do on its own: WITH CHECK has no access to OLD, so it cannot
-- express "this column may change and the others may not".
drop policy if exists notifications_update on public.notifications;
create policy notifications_update
  on public.notifications
  for update
  to authenticated
  using (public.is_active_user() and user_id = (select auth.uid()))
  with check (public.is_active_user() and user_id = (select auth.uid()));

-- Dismissing one you have dealt with.
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete
  on public.notifications
  for delete
  to authenticated
  using (public.is_active_user() and user_id = (select auth.uid()));

-- No INSERT policy: see the header. Triggers are SECURITY DEFINER and bypass
-- this, which is the only way a row is ever created.


create or replace function public.guard_notification_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.id          is distinct from old.id
     or new.user_id  is distinct from old.user_id
     or new.ticket_id is distinct from old.ticket_id
     or new.type     is distinct from old.type
     or new.actor_id is distinct from old.actor_id
     or new.from_status is distinct from old.from_status
     or new.to_status   is distinct from old.to_status
     or new.created_at  is distinct from old.created_at then
    raise exception 'Only read_at can be changed on a notification'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists notifications_guard_change on public.notifications;
create trigger notifications_guard_change
  before update on public.notifications
  for each row
  execute function public.guard_notification_change();


-- =============================================================================
-- Writing them.
-- =============================================================================

/**
 * Insert one notification, skipping the actor's own action and any recipient
 * who no longer exists.
 */
create or replace function public.notify_user(
  p_user   uuid,
  p_ticket uuid,
  p_type   public.notification_type,
  p_actor  uuid,
  p_from   public.ticket_status default null,
  p_to     public.ticket_status default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;

  insert into public.notifications
    (user_id, ticket_id, type, actor_id, from_status, to_status)
  values
    (p_user, p_ticket, p_type, p_actor, p_from, p_to);
end;
$$;


create or replace function public.notify_ticket_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_user  uuid;
begin
  -- Soft-deleting a ticket also lands here as an UPDATE. Nobody wants to be
  -- told the status of something that has just been removed from their board.
  if new.deleted_at is not null then
    return new;
  end if;

  for v_user in
    select a.user_id from public.ticket_assignees a where a.ticket_id = new.id
    union
    select new.created_by
  loop
    perform public.notify_user(
      v_user, new.id, 'STATUS_CHANGED', v_actor, old.status, new.status
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists tickets_notify_status on public.tickets;
create trigger tickets_notify_status
  after update of status on public.tickets
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_ticket_status_change();


create or replace function public.notify_ticket_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    perform public.notify_user(new.user_id, new.ticket_id, 'ASSIGNED', v_actor);
    return new;
  end if;

  perform public.notify_user(old.user_id, old.ticket_id, 'UNASSIGNED', v_actor);
  return old;
end;
$$;

drop trigger if exists ticket_assignees_notify on public.ticket_assignees;
create trigger ticket_assignees_notify
  after insert or delete on public.ticket_assignees
  for each row
  execute function public.notify_ticket_assignment();


-- =============================================================================
-- Realtime.
--
-- Only `notifications` joins the publication, not `tickets`. Each client
-- subscribes with `user_id=eq.<self>`, so the rows a browser can receive are
-- the rows it may already read — the filter and the RLS policy agree by
-- construction, and no ticket content crosses the wire to someone who should
-- not see it.
--
-- REPLICA IDENTITY FULL is required for Realtime to evaluate the filter and RLS
-- against the row; with the default identity only the primary key is published
-- and every subscriber's filter would fail to match.
-- =============================================================================

alter table public.notifications replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
