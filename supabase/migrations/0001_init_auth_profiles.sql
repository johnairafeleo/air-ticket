-- =============================================================================
-- 0001_init_auth_profiles.sql
--
-- Phase 1 foundation: user profiles, roles, and the authorization primitives
-- every later migration builds on.
--
-- Design notes that are easy to get wrong and expensive to discover later:
--
--   * RLS recursion. A policy on `profiles` that SELECTs `profiles` to find the
--     caller's role recurses and the query errors out. The helper functions
--     below are SECURITY DEFINER, so they run as the owner, bypass RLS, and
--     cannot recurse.
--
--   * Column-level protection. An RLS UPDATE policy cannot express "you may
--     edit this row but not that column" — WITH CHECK has no access to OLD.
--     Role and is_active are therefore guarded by a BEFORE UPDATE trigger.
--
--   * Deactivation. Supabase Auth knows nothing about profiles.is_active, so a
--     deactivated user keeps a valid JWT and could query the database directly
--     with the anon key. Every policy is gated on is_active_user().
-- =============================================================================

create extension if not exists citext with schema extensions;


-- =============================================================================
-- Enum
-- =============================================================================

create type public.user_role as enum ('USER', 'AGENT', 'ADMIN');


-- =============================================================================
-- profiles
--
-- One row per auth.users row, created by the handle_new_user() trigger below.
--
-- `email` is duplicated from auth.users on purpose: the admin user list and
-- every future ticket query can then join a single table instead of mixing in
-- service-role calls to the auth schema. handle_new_user() is the only writer,
-- and guard_profile_role_change() prevents it drifting.
-- =============================================================================

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       extensions.citext not null,
  full_name   text,
  avatar_url  text,
  role        public.user_role not null default 'USER',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint profiles_full_name_length check (
    full_name is null or char_length(full_name) between 1 and 120
  ),
  constraint profiles_avatar_url_length check (
    avatar_url is null or char_length(avatar_url) <= 2048
  )
);

comment on table public.profiles is
  'Application-level user record. Mirrors auth.users, adds role and activation state.';

create unique index profiles_email_key on public.profiles (email);
create index profiles_role_idx on public.profiles (role);

-- Partial index: we only ever look for the small set of deactivated accounts.
create index profiles_inactive_idx on public.profiles (id) where is_active = false;

-- Supports the "is there another active admin?" lockout check below.
create index profiles_active_admins_idx on public.profiles (id)
  where role = 'ADMIN' and is_active = true;


-- =============================================================================
-- Shared trigger function: keep updated_at honest.
-- Reused by every table added in later phases.
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();


-- =============================================================================
-- Authorization helpers
--
-- SECURITY DEFINER + pinned search_path. These bypass RLS, which is exactly why
-- they can be called from inside a profiles policy without recursing.
--
-- They are read-only (plain SELECTs against a single table) and take no
-- arguments, so there is no injection surface to abuse.
-- =============================================================================

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
$$;

comment on function public.current_user_role() is
  'Role of the calling user. SECURITY DEFINER so it can be used inside RLS policies on profiles without recursion.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'ADMIN'
      and p.is_active
  )
$$;

-- Gate for every policy. A deactivated user holds a valid JWT until it expires,
-- so without this they could still read and write through the anon key.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
  )
$$;

revoke execute on function public.current_user_role() from public;
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_active_user() from public;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;


-- =============================================================================
-- Profile bootstrap
--
-- Creating the profile from application code would orphan the auth user
-- whenever the second write failed. Doing it in a trigger makes the pair atomic.
--
-- The role is hard-coded to 'USER': signup metadata is attacker-controlled and
-- must never be able to name a role.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- =============================================================================
-- Role / activation guard
--
-- Two separate jobs:
--   1. Only an admin may change `role` or `is_active` at all.
--   2. Nobody may remove the last active admin, by demotion or deactivation.
--
-- The advisory lock matters: a plain count() lets two admins demote each other
-- concurrently — both transactions see two admins, both commit, and the system
-- is left with zero. Serializing role changes on a single lock key closes that
-- race. Role changes are rare, so the contention cost is irrelevant.
-- =============================================================================

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid := (select auth.uid());
  v_role_changed boolean := new.role is distinct from old.role;
  v_deactivated  boolean := old.is_active and not new.is_active;
  v_other_admins integer;
begin
  if not v_role_changed and new.is_active is not distinct from old.is_active then
    return new;
  end if;

  -- v_actor is null for service-role and SQL-editor access, which is how an
  -- admin is bootstrapped in the first place. Those callers skip the role check
  -- but are still held to the last-admin rule below.
  if v_actor is not null and not public.is_admin() then
    if v_role_changed then
      raise exception 'Only administrators can change a user role'
        using errcode = '42501';
    else
      raise exception 'Only administrators can activate or deactivate a user'
        using errcode = '42501';
    end if;
  end if;

  if (v_role_changed and old.role = 'ADMIN' and new.role <> 'ADMIN')
     or (v_deactivated and old.role = 'ADMIN')
  then
    -- Serialize every admin demotion/deactivation against each other.
    perform pg_advisory_xact_lock(hashtext('public.profiles:last_admin'));

    select count(*)
      into v_other_admins
      from public.profiles p
     where p.role = 'ADMIN'
       and p.is_active
       and p.id <> old.id;

    if v_other_admins = 0 then
      raise exception 'Cannot remove the last active administrator'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_guard_role_change
  before update on public.profiles
  for each row
  execute function public.guard_profile_role_change();


-- =============================================================================
-- Email integrity
--
-- profiles.email is a copy of auth.users.email. The UPDATE policy below lets a
-- user edit their own row, which without this guard would let them set an
-- arbitrary email on their profile and desync the two tables.
--
-- The only legitimate writer is the sync trigger on auth.users, which runs with
-- auth.uid() = null.
-- =============================================================================

create or replace function public.guard_profile_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and (select auth.uid()) is not null then
    raise exception 'profiles.email is managed by Supabase Auth and cannot be edited directly'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_email_change
  before update on public.profiles
  for each row
  execute function public.guard_profile_email_change();

-- Keep the copy current when a user changes their email through Supabase Auth.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = new.email
   where id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();


-- =============================================================================
-- Row Level Security
--
-- Reminder: RLS is row-level only. Every policy below grants or denies whole
-- rows — it cannot hide individual columns. Agents can read full profile rows
-- because in an internal helpdesk they need to identify and contact requesters.
-- =============================================================================

alter table public.profiles enable row level security;

-- SELECT: yourself; admins see everyone; agents see everyone so they can be
-- assigned work and can identify requesters.
create policy profiles_select
  on public.profiles
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      id = (select auth.uid())
      or public.current_user_role() in ('AGENT', 'ADMIN')
    )
  );

-- UPDATE: your own row, or any row if you are an admin.
-- The role and is_active columns are protected by guard_profile_role_change().
create policy profiles_update
  on public.profiles
  for update
  to authenticated
  using (
    public.is_active_user()
    and (id = (select auth.uid()) or public.is_admin())
  )
  with check (
    public.is_active_user()
    and (id = (select auth.uid()) or public.is_admin())
  );

-- No INSERT policy: only the SECURITY DEFINER signup trigger writes profiles.
-- No DELETE policy: profiles disappear via the auth.users cascade.


-- =============================================================================
-- Grants
--
-- RLS decides which rows; grants decide which statements are possible at all.
-- Withholding INSERT/DELETE here means a missing policy can never become an
-- accidental hole.
-- =============================================================================

grant select, update on public.profiles to authenticated;
