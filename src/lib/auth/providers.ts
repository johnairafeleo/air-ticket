import "server-only";

import { cache } from "react";

import { env } from "@/lib/env";

/**
 * Which auth providers the Supabase project actually has enabled.
 *
 * `signInWithOAuth()` does NOT validate this — it just builds a URL and returns
 * it, so a disabled provider sends the user to Supabase's /authorize endpoint,
 * which answers with a raw JSON 400 ("provider is not enabled"). Checking first
 * lets us fail inside the app with something readable.
 */
export const enabledProviders = cache(async (): Promise<Set<string>> => {
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
      {
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
        // Provider config changes rarely, and this sits on the login page's
        // critical path.
        next: { revalidate: 300 },
      },
    );

    if (!response.ok) return new Set();

    const settings = (await response.json()) as {
      external?: Record<string, boolean>;
    };

    return new Set(
      Object.entries(settings.external ?? {})
        .filter(([, on]) => on)
        .map(([name]) => name),
    );
  } catch {
    // Never block sign-in on this lookup; the caller treats an empty set as
    // "show password sign-in only".
    return new Set();
  }
});

export async function isProviderEnabled(name: string): Promise<boolean> {
  return (await enabledProviders()).has(name);
}
