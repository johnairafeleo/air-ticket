import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback (Google, and any other provider enabled later).
 *
 * This is the PKCE `?code=` flow, deliberately separate from `/auth/confirm`,
 * which handles emailed `token_hash` links. The distinction matters: PKCE keeps
 * its `code_verifier` in a cookie in the browser that started the flow — correct
 * for OAuth, since the redirect always returns to the same browser, but it would
 * break an emailed link opened on another device.
 */

/** Relative single-slash paths only, so `next` cannot become an open redirect. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // A refusal comes back as a parameter, not a failed redirect.
  const error = searchParams.get("error");
  if (error) {
    redirect(
      `/auth/auth-error?reason=${
        error === "access_denied" ? "cancelled" : "oauth_failed"
      }`,
    );
  }

  if (!code) {
    redirect("/auth/auth-error?reason=oauth_failed");
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    redirect("/auth/auth-error?reason=oauth_failed");
  }

  redirect(next);
}
