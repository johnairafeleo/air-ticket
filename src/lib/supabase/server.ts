import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Uses the publishable/anon key and the request's cookies, so every query runs
 * under the caller's RLS context. This is the client that should be used for
 * essentially all application data access.
 *
 * `cookies()` is async in Next.js 16 — synchronous access was removed.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. This is expected and safe to
            // ignore: proxy.ts refreshes the session cookie on every request, so
            // the token stays current even though this particular write is a
            // no-op. Only swallow it here — in Server Actions and Route Handlers
            // the write does go through.
          }
        },
      },
    },
  );
}
