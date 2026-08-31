import * as z from "zod";

/**
 * Public environment. These values are inlined into the client bundle, so this
 * module must never import anything server-only.
 *
 * `process.env.NEXT_PUBLIC_*` has to be written out literally — Next.js replaces
 * the exact text at build time, so a dynamic lookup like `process.env[key]`
 * would resolve to `undefined` in the browser.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "NEXT_PUBLIC_SUPABASE_URL must be your Supabase project URL.",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, { error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required." }),
  NEXT_PUBLIC_SITE_URL: z.url({
    error: "NEXT_PUBLIC_SITE_URL must be an absolute URL, e.g. http://localhost:3000.",
  }),
});

const parsed = clientEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

if (!parsed.success) {
  // Fail at import time with a readable message rather than surfacing as an
  // undefined value somewhere deep in the Supabase client.
  throw new Error(
    `Invalid public environment variables:\n${z.prettifyError(parsed.error)}\n\n` +
      "Copy .env.local.example to .env.local and fill in the values.",
  );
}

export const env = parsed.data;

/** Absolute URL builder for auth redirect links. */
export function absoluteUrl(path: string): string {
  return new URL(path, env.NEXT_PUBLIC_SITE_URL).toString();
}
