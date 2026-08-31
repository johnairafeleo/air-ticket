import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase auth cookie for an incoming request.
 *
 * Used only by the root `proxy.ts`. Server Components cannot write cookies, so
 * without this pass the access token would never be refreshed and sessions
 * would silently expire mid-visit.
 *
 * The returned `response` carries the refreshed `Set-Cookie` headers. Whatever
 * the caller does next, those cookies must survive — see `copyCookies` below.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; user: User | null }> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to the request first so anything downstream in this same pass
          // sees the new token, then rebuild the response around the updated
          // request and set the outgoing cookies on it.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase. getSession() would only
  // decode the cookie, which the client controls, so it must not be trusted here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}

/**
 * Moves refreshed auth cookies onto a different response.
 *
 * Returning a bare `NextResponse.redirect(...)` from the proxy drops the
 * `Set-Cookie` headers that `updateSession` just produced, which logs the user
 * straight back out. Every response the proxy returns must go through here.
 */
export function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}
