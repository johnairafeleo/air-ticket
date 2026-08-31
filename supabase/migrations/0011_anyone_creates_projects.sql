-- =============================================================================
-- 0011_anyone_creates_projects.sql
--
-- Let any active user create a project.
--
-- Creating a project was system-admin only, which made a new account inert: it
-- could see nothing until an administrator set something up. The instinct to fix
-- that by making signups system admins would have been far worse — is_admin()
-- short-circuits every project check, so each new account would have seen every
-- project and ticket in the database.
--
-- This is the safe version of the same goal. A new user creates their own
-- project, becomes its MANAGER via the handle_new_project() trigger from 0009,
-- and invites people themselves. They still see nothing they were not given.
--
-- Everything else is unchanged: editing a project and managing its membership
-- still require MANAGER on that project.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================

drop policy if exists projects_insert on public.projects;
create policy projects_insert
  on public.projects
  for insert
  to authenticated
  -- Any active user. handle_new_project() immediately makes the creator its
  -- manager, so a project is never left without one.
  with check (public.is_active_user());
