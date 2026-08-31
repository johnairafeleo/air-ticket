# Setup

Getting Air Ticket running against a hosted Supabase project.

---

## 1. Prerequisites

**Node.js 22 or newer is required.** `@supabase/supabase-js` v2.110+ dropped Node 20:
`createClient()` throws `Node.js detected but native WebSocket not found`, because
`realtime-js` needs the global `WebSocket` that only exists from Node 22.

This machine has Node 22.12.0 installed under nvm-windows but not selected. Switch to it
from an **Administrator** terminal (nvm-windows re-points a symlink, which needs elevation):

```powershell
nvm use 22.12.0
node --version   # must print v22.x or newer
```

Then reinstall dependencies so native/optional packages match the runtime:

```bash
npm install
```

---

## 2. Create the Supabase project

1. Create a project at <https://supabase.com/dashboard>. Note the database password —
   it is only shown once and is needed for `SUPABASE_DB_URL` below.
2. Copy `.env.local.example` to `.env.local` and fill it in from
   **Project Settings → API** and **Project Settings → Database**.

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Settings → API → "Publishable key" (`sb_publishable_…`) or legacy "anon public" (a JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → "Secret key" (`sb_secret_…`) or legacy "service_role" |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` in development |
| `SUPABASE_DB_URL` | Settings → Database → Connection string → URI |

Newer projects show the `sb_publishable_` / `sb_secret_` key format; older ones show JWT
`anon` / `service_role` keys. Either works — paste whichever your dashboard shows into the
matching variable.

For `SUPABASE_DB_URL`, prefer the **Session pooler** string (port 5432). The direct
connection host is frequently IPv6-only and will not resolve on a typical home or Windows
network.

`.env.local` is gitignored. `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` are secrets:
the first bypasses Row Level Security entirely, the second contains your database password.

---

## 3. Apply the migration

Open **SQL Editor** in the dashboard, paste the contents of
`supabase/migrations/0001_init_auth_profiles.sql`, and run it.

> **If you ever link the Supabase CLI**, run
> `supabase migration repair --status applied 0001` *first*. Applying SQL through the
> dashboard does not record anything in `supabase_migrations.schema_migrations`, so a later
> `supabase db push` would try to re-apply `0001` and fail on the existing objects.

---

## 4. Configure Auth

### Redirect URLs

**Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: add `http://localhost:3000/**`

### Email templates — required, not optional

**Authentication → Email Templates.** The stock templates use `{{ .ConfirmationURL }}`,
which under PKCE lands on `?code=…`. That code can only be exchanged by the browser that
started the flow, because the `code_verifier` lives in a cookie there — so opening the
email on a phone or a second browser fails.

`/auth/confirm` uses the `token_hash` flow instead, which has no such constraint. That
requires editing two templates.

**Confirm signup** — set the link to:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard
```

**Reset password** — set the link to:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
```

Without these edits every confirmation and reset link lands on the "link is not valid"
page, because no `token_hash` reaches the handler.

> Supabase's built-in SMTP is rate limited to a handful of emails per hour. That is fine
> for development; configure a real SMTP provider before going live.

---

## 5. Generate database types

```bash
npm run db:types
```

Writes `src/types/database.ts` from the live schema.

**This needs a running Docker daemon.** The CLI runs pg_meta in a container to introspect
the schema, even with `--db-url`. (An earlier version of this document claimed otherwise;
that was wrong, verified against CLI 2.116.) To avoid Docker, authenticate instead:

```bash
npx supabase login
npx supabase gen types typescript --project-id zbjqsesdfvrjqsuyiogx > src/types/database.ts
```

Until either route is set up, `src/types/database.ts` is maintained by hand and verified
against the live schema with a direct SQL introspection query.

**Re-run this after every migration and commit the result.** The file is generated; never
edit it by hand. `src/types/app.ts` derives its aliases from it, so a schema change that
breaks the app surfaces as a compile error rather than a runtime surprise.

---

## 6. Run it

```bash
npm run dev
```

Then create your first account at <http://localhost:3000/register>.

### Promote yourself to admin

Every account starts as `USER` — signup metadata can never request a role, and the
`handle_new_user()` trigger hard-codes it. Bootstrap the first admin from the SQL Editor:

```sql
update public.profiles
   set role = 'ADMIN'
 where email = 'you@company.com';
```

This works because SQL Editor statements run with `auth.uid()` null, which the
`guard_profile_role_change()` trigger treats as the bootstrap path. Every subsequent role
change should go through **Admin → Users** in the app.

---

## Verifying it works

```bash
npm run typecheck
npm run lint
npm run build
```

Manual checks:

1. `/` while signed out redirects to `/login`.
2. Register → confirmation email → link works → `/dashboard`, and a `profiles` row exists
   with role `USER`.
3. Sign out; `/dashboard` redirects to `/login`. Sign in and refresh — the session survives.
4. Forgot password → email → new password works, old one is rejected.
5. As a `USER`, `/admin/users` redirects to `/dashboard` (server-side, before render).
6. **Privilege escalation** — signed in as a non-admin, in the browser console:
   ```js
   const { createClient } = await import("/_next/static/chunks/...");  // or use the app's client
   await supabase.from("profiles").update({ role: "ADMIN" }).eq("id", myId);
   ```
   must fail with `Only administrators can change a user role`.
7. **Last-admin lockout** — as the only admin, try to demote or deactivate yourself. The UI
   refuses, and so does the database.
8. **Deactivation** — set `is_active = false` on a signed-in test user in SQL. Their next
   request bounces to `/login`, and a direct `from('profiles').select()` with their live
   session returns nothing.
9. **Key leak** — `grep -r "SERVICE_ROLE" src/` returns only `src/lib/supabase/admin.ts`.

---

## Version pins and why

| Package | Pin | Reason |
| --- | --- | --- |
| `typescript` | `~5.9.3` | TypeScript 7.x is the current `latest`, but `eslint-config-next@16.3.3` depends on `typescript-eslint@^8`, whose peer range is `>=4.8.4 <6.1.0`. TS 7 would run the lint step on an unsupported compiler. Revisit when typescript-eslint widens support. |
| `next` | `16.3.3` | Current stable. Note it renamed the `middleware` convention to `proxy` — see `proxy.ts`. |
| `@supabase/ssr` | `^0.12.5` | Still pre-1.0; its peer range on `supabase-js` is narrow and tracks it closely. Upgrade the two together. |

---

## Architecture notes

**Authorization has two layers, and only one of them is the boundary.**

Postgres Row Level Security is the boundary. `src/lib/auth/permissions.ts` mirrors those
rules so the UI can hide what the database would reject and actions can return readable
errors — but it never replaces RLS. Anyone can talk to Supabase directly with the anon key.

**A layout is not a guard.** In the App Router a layout does not re-render on navigation
and cannot stop a child segment or a Server Function from running. `(app)/layout.tsx` calls
`requireUser()` to render the shell; every page calls `requireUser()` or `requireRole()`
for itself. `getSession()` is wrapped in React `cache()`, so the repetition costs one round
trip per render pass.

**`proxy.ts` is not a guard either.** It refreshes the session cookie and applies coarse
redirects. Server Functions are POSTs to the route that declares them, so a matcher change
can silently remove proxy coverage.

**Why `SECURITY DEFINER` helpers.** A policy on `profiles` that reads `profiles` to find
the caller's role recurses and errors out. `current_user_role()`, `is_admin()` and
`is_active_user()` run as the owner, bypass RLS, and so cannot recurse. JWT role claims
were rejected as an alternative: a claim stays stale until the token refreshes, leaving a
demoted admin with admin rights for up to an hour.

**Why role changes need a trigger, not just a policy.** An RLS `UPDATE` policy cannot say
"you may edit this row but not that column" — `WITH CHECK` has no access to `OLD`. The
`guard_profile_role_change()` trigger enforces the column rules, and takes
`pg_advisory_xact_lock` before the last-admin count so two admins cannot demote each other
concurrently and leave the system with none.

**Why `is_active` is checked twice.** Supabase Auth knows nothing about
`profiles.is_active`, so a deactivated user keeps a valid JWT until it expires. Every RLS
policy is gated on `is_active_user()`, and `getSession()` refuses the session as well.
