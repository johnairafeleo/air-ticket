import "server-only";

import * as z from "zod";

/**
 * Server-only environment.
 *
 * The `server-only` import above makes any client-side import of this module a
 * build error, which is the guardrail that keeps the service-role key out of
 * the browser bundle.
 *
 * Parsed lazily: `npm run build` and `npm run db:types` should not fail just
 * because a secret is absent in an environment that never uses it.
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, {
    error:
      "SUPABASE_SERVICE_ROLE_KEY is required for admin operations. " +
      "Find it in Supabase under Project Settings -> API (labelled 'Secret key' or 'service_role').",
  }),
});

let cached: z.infer<typeof serverEnvSchema> | undefined;

export function serverEnv(): z.infer<typeof serverEnvSchema> {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${z.prettifyError(parsed.error)}`,
    );
  }

  cached = parsed.data;
  return cached;
}
