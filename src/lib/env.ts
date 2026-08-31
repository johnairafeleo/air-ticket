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
  // Fail at import time rather than surfacing as an undefined value deep inside
  // the Supabase client. This also fails the build, which is intended: a broken
  // deployment is worse than no deployment.
  //
  // The offending names are repeated on a single leading line because build
  // logs wrap and truncate — the detail below scrolls out of view, which is
  // exactly when you most need to know which variable is missing.
  const names = [
    ...new Set(parsed.error.issues.map((issue) => String(issue.path[0]))),
  ];

  throw new Error(
    [
      `Missing or invalid environment variables: ${names.join(", ")}`,
      "",
      z.prettifyError(parsed.error),
      "",
      "Locally: copy .env.local.example to .env.local and fill it in.",
      "On Vercel: add them under Settings -> Environment Variables for",
      "Production, Preview AND Development, then redeploy. NEXT_PUBLIC_* values",
      "are inlined at build time, so a change needs a rebuild to take effect.",
    ].join("\n"),
  );
}

export const env = parsed.data;

/** Absolute URL builder for auth redirect links. */
export function absoluteUrl(path: string): string {
  return new URL(path, env.NEXT_PUBLIC_SITE_URL).toString();
}
