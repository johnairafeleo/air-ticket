-- =============================================================================
-- 0015 — Let project members see who else is in their project.
--
-- The bug: /projects/members listed "Unknown" for everyone except the viewer.
--
-- 0009 moved authorization into per-project membership, but profiles_select was
-- left as 0001 wrote it: your own row, or every row if your GLOBAL role is
-- AGENT or ADMIN. A project MANAGER whose global role is USER — now the normal
-- case, since anyone may create a project and 0014 made USER the default —
-- could therefore read no profile but their own.
--
-- Nothing failed loudly, because RLS filters rather than errors: the
-- project_members rows came back (so the count read "3 people") while the
-- embedded profiles join returned null for each one, and the UI fell back to
-- its "Unknown" placeholder.
--
-- Fix: you may also read the profile of anyone you share a project with.
--
-- Tradeoff, stated plainly: profiles rows carry email, and RLS is row-level, so
-- this exposes a co-member's email address to everyone in the same project,
-- VIEWERs included. That is the same call 0001 already made for agents, and an
-- internal helpdesk where you cannot see the name of the person you are
-- assigning work to is not usable. It does NOT widen anything across projects —
-- share no project, see no profile.
-- =============================================================================


-- =============================================================================
-- Do we share at least one project with this user?
--
-- SECURITY DEFINER is load-bearing, not boilerplate. This is called from a
-- policy ON profiles, so it must not re-enter that policy. Reading
-- project_members under RLS would do exactly that:
--
--   profiles_select -> project_members RLS -> can_view_project()
--                   -> is_admin() -> reads profiles -> profiles_select -> ...
--
-- Running as definer bypasses project_members' own policies and cuts the loop.
-- The function takes no input beyond a user id and keys the "me" side off
-- auth.uid() internally, so it cannot be used to probe unrelated projects.
-- =============================================================================

create or replace function public.shares_project_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members mine
    join public.project_members theirs
      on theirs.project_id = mine.project_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user
  )
$$;

revoke execute on function public.shares_project_with(uuid) from public;
grant execute on function public.shares_project_with(uuid) to authenticated;


-- =============================================================================
-- SELECT: yourself; anyone you share a project with; agents and admins see all.
-- =============================================================================

drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      id = (select auth.uid())
      or public.current_user_role() in ('AGENT', 'ADMIN')
      or public.shares_project_with(id)
    )
  );
