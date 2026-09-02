import { NextResponse, type NextRequest } from "next/server";

import { copyCookies, updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy`. It runs on the
 * Node.js runtime, which is what Supabase needs.
 *
 * This does two things and deliberately nothing more:
 *
 *   1. Refreshes the Supabase auth cookie on every matched request.
 *   2. Applies coarse redirects so signed-out users don't render a protected
 *      shell only to be bounced, and signed-in users skip the login page.
 *
 * It is NOT a security boundary. Server Functions are POSTs to the route that
 * declares them, so a matcher change can silently remove proxy coverage — and a
 * layout cannot stop a child segment from rendering either. Real authorization
 * lives in `requireUser()` / `requireRole()`, called by each page and action,
 * and ultimately in Postgres RLS.
 */

/** Prefixes that require a session. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/tickets",
  "/admin",
  "/profile",
  "/notifications",
];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve where they were headed so login can send them back.
    url.search = "";
    url.searchParams.set("next", pathname);
    return copyCookies(response, NextResponse.redirect(url));
  }

  // The "already signed in, skip the login page" redirect deliberately does NOT
  // live here. The proxy only knows about auth-level identity, while pages
  // require auth *plus* an active profile row. When those disagree — a user with
  // no profile, or a deactivated one — the proxy sends /login -> /dashboard and
  // the page sends /dashboard -> /login, looping forever with no explanation.
  //
  // The auth pages make that call themselves via redirectIfAuthenticated(),
  // which uses the same source of truth the protected pages use.
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Auth routes under
     * /auth/* are matched on purpose so the session cookie is refreshed there
     * too.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
