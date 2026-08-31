import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { hasAtLeastRole } from "@/lib/auth/permissions";
import type { Profile, UserRole } from "@/types/app";

/**
 * Data Access Layer for identity.
 *
 * Every protected page, Server Action and Route Handler calls one of these.
 *
 * Important: a layout is NOT a sufficient guard in the App Router. Layouts do
 * not re-render on navigation, and a layout cannot stop a child segment or a
 * Server Function from running. So `(app)/layout.tsx` calling `requireUser()`
 * is for rendering the shell — it is not what protects the pages beneath it.
 * Each page and action repeats the check.
 *
 * `cache()` memoizes per render pass, so repeating the check across the layout
 * and several components costs one round trip, not one per call.
 */

export type Session = { user: User; profile: Profile };

/**
 * Current user and profile, or null when signed out / deactivated.
 *
 * Deactivation is enforced here as well as in RLS. Supabase Auth knows nothing
 * about `profiles.is_active`, so a deactivated user still holds a valid JWT;
 * without this check they would keep rendering pages until it expired.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();

  // getUser() revalidates with the Supabase Auth server. getSession() only
  // decodes a cookie the client controls and must not be trusted server-side.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // Authenticated but no profile row. Almost always means the migration has
    // not been applied, so handle_new_user() never created one. Silence here
    // turns into a mystifying redirect loop, so say so loudly on the server.
    console.error(
      `[auth] No profiles row for authenticated user ${user.id} (${user.email}). ` +
        "Has supabase/migrations/0001_init_auth_profiles.sql been applied?",
    );
    return null;
  }

  // Deactivated users keep a valid JWT until it expires, so refuse the session
  // here as well as in RLS.
  if (!profile.is_active) return null;

  return { user, profile };
});

/** Convenience wrapper for components that only need the profile. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const session = await getSession();
  return session?.profile ?? null;
});

/**
 * Require a signed-in, active user. Redirects to /login otherwise.
 *
 * @param returnTo path to come back to after signing in.
 */
export async function requireUser(returnTo?: string): Promise<Session> {
  const session = await getSession();

  if (!session) {
    const target = returnTo
      ? `/login?next=${encodeURIComponent(returnTo)}`
      : "/login";
    redirect(target);
  }

  return session;
}

/**
 * Send an already-signed-in visitor away from the auth pages.
 *
 * Called by the auth pages rather than the proxy, so the decision uses the same
 * source of truth as the protected pages. If it lived in the proxy it would
 * only see auth-level identity, and a user without an active profile would
 * bounce between /login and /dashboard forever.
 */
export async function redirectIfAuthenticated(to = "/dashboard"): Promise<void> {
  const session = await getSession();
  if (session) redirect(to);
}

/**
 * Require at least `role`. Sends an authenticated but under-privileged user to
 * the dashboard rather than the login page — they are signed in, just not
 * allowed here.
 */
export async function requireRole(role: UserRole): Promise<Session> {
  const session = await requireUser();

  if (!hasAtLeastRole(session.profile, role)) {
    redirect("/dashboard");
  }

  return session;
}
