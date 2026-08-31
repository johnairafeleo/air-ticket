-- =============================================================================
-- 0002_tickets.sql
--
-- Phase 2: categories and tickets.
--
-- Idempotent, like 0001 — it gets pasted into the Supabase SQL Editor by hand.
--
-- The authorization story mirrors 0001: RLS decides which *rows* you can touch,
-- and a BEFORE UPDATE trigger decides which *columns* you may change, because
-- an RLS policy has no access to OLD and so cannot express column rules.
--
-- Who may do what:
--
--   USER   own tickets only. May edit title/description while the ticket is
--          still OPEN, and may close their own RESOLVED ticket. May never set
--          priority, assignment, or an arbitrary status.
--   AGENT  tickets assigned to them, plus the unassigned queue. May change
--          status and priority, and may claim an unassigned ticket.
--   ADMIN  everything, including assigning to anyone.
-- =============================================================================


-- =============================================================================
-- Enums
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'ticket_status' and n.nspname = 'public'
  ) then
    create type public.ticket_status as enum
      ('OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED');
  end if;

  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'ticket_priority' and n.nspname = 'public'
  ) then
    create type public.ticket_priority as enum
      ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
  end if;
end
$$;


-- =============================================================================
-- categories
-- =============================================================================

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint categories_name_length check (char_length(name) between 2 and 80),
  constraint categories_description_length check (
    description is null or char_length(description) <= 500
  )
);

comment on table public.categories is
  'Ticket categories. Managed by admins; deactivated rather than deleted so historical tickets keep their category.';

-- Case-insensitive uniqueness: "Billing" and "billing" are the same category.
create unique index if not exists categories_name_key
  on public.categories (lower(name));

create index if not exists categories_active_idx
  on public.categories (name) where is_active = true;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row
  execute function public.set_updated_at();


-- =============================================================================
-- tickets
--
-- Ticket numbers come from a sequence rather than a count, so concurrent
-- inserts cannot collide and numbers stay stable if a ticket is ever removed.
-- =============================================================================

create sequence if not exists public.ticket_number_seq as bigint start 1;

create table if not exists public.tickets (
  id            uuid primary key default gen_random_uuid(),
  ticket_number text not null default
                  ('TKT-' || lpad(nextval('public.ticket_number_seq')::text, 6, '0')),
  title         text not null,
  description   text not null,

  category_id   uuid references public.categories (id) on delete restrict,
  priority      public.ticket_priority not null default 'MEDIUM',
  status        public.ticket_status not null default 'OPEN',

  -- RESTRICT, not CASCADE: tickets are business records. Deleting a person who
  -- has raised tickets is blocked; deactivate the profile instead. This also
  -- means deleting an auth.users row fails for anyone with tickets, which is
  -- the intended safeguard rather than an oversight.
  created_by    uuid not null references public.profiles (id) on delete restrict,
  -- Unassignment on delete is fine: the ticket returns to the queue.
  assigned_to   uuid references public.profiles (id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  closed_at     timestamptz,

  constraint tickets_title_length check (char_length(title) between 3 and 200),
  constraint tickets_description_length check (
    char_length(description) between 10 and 10000
  )
);

comment on table public.tickets is
  'Support tickets. Status changes go through can_transition(); column-level permissions are enforced by guard_ticket_change().';

create unique index if not exists tickets_ticket_number_key
  on public.tickets (ticket_number);

create index if not exists tickets_created_by_idx on public.tickets (created_by);
create index if not exists tickets_assigned_to_idx on public.tickets (assigned_to);
create index if not exists tickets_category_id_idx on public.tickets (category_id);
create index if not exists tickets_status_idx on public.tickets (status);
create index if not exists tickets_priority_idx on public.tickets (priority);
create index if not exists tickets_created_at_idx on public.tickets (created_at desc);

-- The agent queue: unassigned tickets that are still live.
create index if not exists tickets_unassigned_idx
  on public.tickets (created_at desc)
  where assigned_to is null and status <> 'CLOSED';

-- Full-text search over title + description, for the list page's search box.
create index if not exists tickets_search_idx
  on public.tickets
  using gin (to_tsvector('english', title || ' ' || description));

drop trigger if exists tickets_set_updated_at on public.tickets;
create trigger tickets_set_updated_at
  before update on public.tickets
  for each row
  execute function public.set_updated_at();


-- =============================================================================
-- Status transitions
--
-- One definition, used by the trigger below and mirrored in TypeScript for the
-- UI. Keeping it here means an invalid transition is impossible regardless of
-- which client attempts it.
--
-- OPEN -> IN_PROGRESS -> PENDING -> RESOLVED -> CLOSED, with RESOLVED able to
-- reopen. CLOSED is terminal: a recurrence gets a new ticket, so the history of
-- what was actually done stays intact.
-- =============================================================================

create or replace function public.can_transition(
  p_from public.ticket_status,
  p_to   public.ticket_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from = p_to then true
    when p_from = 'OPEN'        then p_to in ('IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED')
    when p_from = 'IN_PROGRESS' then p_to in ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED')
    when p_from = 'PENDING'     then p_to in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')
    when p_from = 'RESOLVED'    then p_to in ('IN_PROGRESS', 'CLOSED')
    when p_from = 'CLOSED'      then false
    else false
  end
$$;

comment on function public.can_transition(public.ticket_status, public.ticket_status) is
  'Whether a ticket may move from one status to another. CLOSED is terminal.';

revoke execute on function public.can_transition(public.ticket_status, public.ticket_status) from public;
grant execute on function public.can_transition(public.ticket_status, public.ticket_status) to authenticated;


-- =============================================================================
-- Insert guard
--
-- Forces a new ticket to start clean: raised by the caller, OPEN, unassigned,
-- with no resolution timestamps. Without this an INSERT could name any
-- created_by and land in any status.
-- =============================================================================

create or replace function public.guard_ticket_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- Service-role / SQL editor (auth.uid() null) is trusted: seeding and admin
  -- tooling need to set these directly.
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
-- Update guard
--
-- Column-level permissions plus transition validity, and it maintains
-- resolved_at / closed_at so those can never disagree with status.
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
     or new.category_id is distinct from old.category_id then
    raise exception 'Only support staff can change priority, category or assignment'
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


-- =============================================================================
-- Row Level Security — categories
-- =============================================================================

alter table public.categories enable row level security;

drop policy if exists categories_select on public.categories;
create policy categories_select
  on public.categories
  for select
  to authenticated
  using (
    public.is_active_user()
    and (is_active or public.is_admin())
  );

drop policy if exists categories_insert on public.categories;
create policy categories_insert
  on public.categories
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists categories_update on public.categories;
create policy categories_update
  on public.categories
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy: categories are deactivated, so historical tickets keep theirs.


-- =============================================================================
-- Row Level Security — tickets
-- =============================================================================

alter table public.tickets enable row level security;

drop policy if exists tickets_select on public.tickets;
create policy tickets_select
  on public.tickets
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      created_by = (select auth.uid())
      or public.is_admin()
      or (
        public.current_user_role() = 'AGENT'
        and (assigned_to = (select auth.uid()) or assigned_to is null)
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
  );

drop policy if exists tickets_update on public.tickets;
create policy tickets_update
  on public.tickets
  for update
  to authenticated
  using (
    public.is_active_user()
    and (
      created_by = (select auth.uid())
      or public.is_admin()
      or (
        public.current_user_role() = 'AGENT'
        and (assigned_to = (select auth.uid()) or assigned_to is null)
      )
    )
  )
  with check (
    public.is_active_user()
    and (
      created_by = (select auth.uid())
      or public.is_admin()
      or (
        public.current_user_role() = 'AGENT'
        and (assigned_to = (select auth.uid()) or assigned_to is null)
      )
    )
  );

-- No DELETE policy: tickets are business records and are never hard-deleted.


-- =============================================================================
-- Grants
-- =============================================================================

grant select on public.categories to authenticated;
grant insert, update on public.categories to authenticated;

grant select, insert, update on public.tickets to authenticated;
grant usage on sequence public.ticket_number_seq to authenticated;


-- =============================================================================
-- Seed categories
--
-- ON CONFLICT DO NOTHING keeps this safe to re-run and preserves any renames.
-- =============================================================================

insert into public.categories (name, description)
values
  ('Hardware',        'Laptops, peripherals, phones and other physical equipment.'),
  ('Software',        'Applications, licences and installation problems.'),
  ('Network',         'Connectivity, VPN, Wi-Fi and access to internal services.'),
  ('Access',          'Accounts, permissions, password and access requests.'),
  ('Facilities',      'Building, desk, meeting room and workplace issues.'),
  ('Other',           'Anything that does not fit the categories above.')
on conflict do nothing;
