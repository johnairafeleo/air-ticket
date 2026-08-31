import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Supabase client for Client Components.
 *
 * Uses the publishable/anon key, so every query runs under the signed-in user's
 * RLS context. Safe to call repeatedly — `createBrowserClient` returns the same
 * underlying instance per browser context.
 */
export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
