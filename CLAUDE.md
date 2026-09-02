# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # next dev
npm run verify     # typecheck && lint && build — run before calling work done
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run db:types   # regenerate src/types/database.ts from the live schema
```

`package.json` carries a `packageManager: yarn@1` field, but the only lockfile is
`package-lock.json` and every documented workflow uses npm. Use npm.

**Node 22+ is required.** `@supabase/supabase-js` v2.110+ calls a global `WebSocket`
that does not exist on Node 20; `createClient()` throws there. There is no test
runner — automated testing is unstarted (Phase 5). `npm run verify` plus the manual
checklist in `docs/SETUP.md` is the current gate.

Environment setup, Supabase Auth email-template configuration (required, not
optional), Google OAuth, and admin bootstrap are all in `docs/SETUP.md`.

## Architecture

Next.js 16 App Router + Supabase, no separate backend. Server Components by
default; mutations are Server Actions in `actions.ts` files colocated with the
route that uses them.

### Authorization has two layers and only one is the boundary

**Postgres RLS is the boundary.** Everything in `src/lib/auth/permissions.ts` and
`src/lib/projects/access.ts` is a *mirror* of the SQL policies, existing so the UI
can hide what the database would reject and actions can return readable errors.
Anyone can talk to Supabase directly with the publishable key, so a check that
lives only in TypeScript is not a check. When you change a policy or guard trigger,
change its mirror, and vice versa.

Two more things that look like guards and are not:

- **`proxy.ts`** (Next.js 16 renamed `middleware` → `proxy`) only refreshes the
  session cookie and applies coarse redirects. Server Functions POST to the route
  that declares them, so a matcher edit can silently drop coverage.
- **Layouts.** They do not re-render on navigation and cannot stop a child segment
  or a Server Function from running. `(app)/layout.tsx` calls `requireUser()` to
  render the shell only — *every page and every action repeats the check itself.*
  `getSession()` is `cache()`d, so the repetition costs one round trip per render.

### Identity and Supabase clients

`src/lib/auth/require-user.ts` is the identity DAL: `getSession()`,
`requireUser()`, `requireRole()`, `redirectIfAuthenticated()`. It uses
`auth.getUser()` (revalidates with the auth server), never `auth.getSession()`
(decodes a client-controlled cookie). It also refuses deactivated users, because
Supabase Auth knows nothing about `profiles.is_active` and a deactivated user keeps
a valid JWT until it expires — hence `is_active` is checked both here and in every
RLS policy.

- `src/lib/supabase/server.ts` — **use this for essentially all data access.**
  Anon key + request cookies, so queries run under the caller's RLS context and a
  missing authorization check fails closed.
- `src/lib/supabase/admin.ts` — service role, **bypasses RLS entirely.** Only for
  what RLS cannot express (reading Supabase Auth state for the admin user list,
  deleting auth users). Its `server-only` import is load-bearing; never remove it.
- `src/lib/supabase/client.ts` — browser client.

### Project scoping

Since migration `0009`, ticket permissions key off the caller's **project role**
(`VIEWER` / `MEMBER` / `AGENT` / `MANAGER`), not their global role
(`USER` / `AGENT` / `ADMIN`); a global `ADMIN` is a superuser everywhere. Components
therefore take a `TicketActor` (`{ id, isSystemAdmin, projectRole }`) built by
`getTicketActor()`, not a bare `Profile`.

The app is scoped to exactly **one** project at a time — there is no "all projects"
mode, so every list, board and dashboard figure describes the same set. The
selection lives in an `active_project` cookie (`src/lib/projects/active.ts`), so
`getActiveProject()` returning null means only one thing: no visible project exists.

Read the project role via the `project_role_of` RPC, not a direct
`project_members` read — RLS shows you *every* member of your projects, so
filtering on `project_id` alone returns many rows and `.maybeSingle()` then reports
you as a non-member of your own project.

### Database and types

Migrations are plain SQL in `supabase/migrations/`, numbered sequentially and
applied through the Supabase dashboard SQL Editor (see `docs/SETUP.md` for the
`migration repair` caveat if the CLI is ever linked). Later migrations
`create or replace` earlier functions — `guard_ticket_insert` is redefined six
times — so **to find what a SQL object currently does, grep for it and read the
highest-numbered hit**, never `0001`.

SQL conventions worth knowing before editing policies:

- Helpers like `is_admin()`, `is_active_user()`, `current_user_role()`,
  `project_role_of()` are `SECURITY DEFINER`. A policy on `profiles` that reads
  `profiles` to find the caller's role recurses and errors; these bypass RLS so it
  cannot. JWT role claims were rejected because a claim stays stale until refresh.
- Column-level rules live in guard **triggers** (`guard_profile_role_change()`,
  `guard_ticket_change()`), not policies: RLS `WITH CHECK` has no access to `OLD`,
  so "may edit this row but not that column" is inexpressible as a policy.

`src/types/database.ts` is **generated** — never hand-edit. `src/types/app.ts`
derives every alias from it, so a schema change that breaks the app surfaces as a
compile error. Run `npm run db:types` after every migration and commit the result.

### Conventions

- **Server Actions return, they don't throw.** `ActionResult<T>` from
  `src/lib/actions/result.ts` (`ok()` / `fail()` / `zodFieldErrors()`), so forms
  render a message instead of tripping the error boundary. On the client,
  `applyServerErrors()` (`src/lib/forms/`) places field errors on the matching
  inputs via React Hook Form's `setError`. Actions re-validate with the same Zod
  schema from `src/lib/validations/` that the client resolver used.
- Actions translate Postgres guard-trigger messages into human text — see
  `describeTicketError()` in `src/app/(app)/tickets/actions.ts`.
- `revalidatePath("/tickets")` matches that exact path only, **not**
  `/tickets/board`. Ticket mutations go through `revalidateTicket()`, which hits
  every affected route.
- **PostgREST `select` strings must be whitespace-free**, built as arrays joined
  with commas (see `TICKET_SELECT` in `src/lib/tickets/queries.ts`). A stray
  newline is sometimes a 400 and sometimes — inside a `...spread` — a silent
  HTTP 200 that drops the joined data. Embeds onto a table with two FKs to the
  same target need an explicit FK hint or PostgREST answers PGRST201.
- Status-transition rules and their labels/styles are mirrored client-side in
  `src/lib/tickets/constants.ts` from `can_transition()` in `0002`. Change both.
- UI is shadcn (`style: radix-nova`, base neutral) in `src/components/ui/`, Tailwind
  v4, `sonner` for toasts, `next-themes` for dark mode. React Compiler is on
  (`reactCompiler: true`), so avoid manual memoization.
- TS is strict plus `noUncheckedIndexedAccess`.

### Build status

Phases 1–2 (auth, profiles, roles, projects, tickets, board, dashboards) are built.
Comments, ticket history/audit log, and attachments are **not yet implemented** —
there are no `ticket_comments`, `ticket_history`, or `ticket_attachments` tables.
