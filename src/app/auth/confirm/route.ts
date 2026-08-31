import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Email link handler for signup confirmation and password recovery.
 *
 * Uses the `token_hash` + `verifyOtp` flow rather than the PKCE `?code=` flow.
 * That matters: with PKCE the `code_verifier` lives in a cookie in the browser
 * that *started* the flow, so opening the email on a phone or a different
 * browser fails. `token_hash` has no such constraint.
 *
 * This requires the Supabase email templates to emit `{{ .TokenHash }}` — see
 * docs/SETUP.md. With the stock `{{ .ConfirmationURL }}` template no token_hash
 * arrives here and every link lands on the error page.
 */

const VALID_TYPES = new Set<EmailOtpType>([
  "signup",
  "recovery",
  "invite",
  "email_change",
  "magiclink",
]);

function isValidType(value: string | null): value is EmailOtpType {
  return value !== null && VALID_TYPES.has(value as EmailOtpType);
}

/** Relative single-slash paths only, so the link cannot be an open redirect. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  if (!tokenHash || !isValidType(type)) {
    redirect("/auth/auth-error?reason=invalid_link");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    redirect("/auth/auth-error?reason=expired_link");
  }

  // Verified: the session cookie is now set, so `next` renders as the user.
  redirect(next);
}
