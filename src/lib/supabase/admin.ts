import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client. **Bypasses Row Level Security entirely.**
 *
 * Only use this where an operation genuinely cannot be expressed under RLS —
 * currently, reading Supabase Auth state (email confirmation status, last sign
 * in) for the admin user list, and deleting auth users.
 *
 * Prefer `@/lib/supabase/server` for everything else: it runs under the
 * caller's RLS context, so a missing authorization check fails closed.
 *
 * The `server-only` import makes importing this from a Client Component a build
 * error. Never remove it.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
