"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/env";
import { isProviderEnabled } from "@/lib/auth/providers";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/actions/result";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";

/**
 * Auth Server Actions.
 *
 * Every action re-validates its input with the same Zod schema the form used.
 * Client-side validation is a convenience; this is the authoritative check.
 *
 * `redirect()` works by throwing, so it is always called *after* any try/catch —
 * catching it would swallow the navigation.
 */

/** Only allow relative, single-slash paths so `next=` cannot become an open redirect. */
function safeNext(next: string | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

export async function login(
  input: unknown,
  next?: string,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the errors below.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Supabase distinguishes these two, and the difference is not sensitive:
    // the user already knows whether they signed up.
    if (error.code === "email_not_confirmed") {
      return fail(
        "Please verify your email address before signing in. Check your inbox for the confirmation link.",
      );
    }
    // Anything else is reported generically so the response cannot be used to
    // probe which email addresses have accounts.
    return fail("Invalid email or password.");
  }

  redirect(safeNext(next));
}

/**
 * Start Google sign-in.
 *
 * Supabase returns a URL to send the browser to; the provider then redirects
 * back to /auth/callback with a PKCE code. Nothing is signed in until that
 * exchange succeeds.
 *
 * Requires Google to be enabled under Authentication -> Providers in Supabase,
 * with the callback registered in the Google console. See docs/SETUP.md.
 */
export async function signInWithGoogle(next?: string): Promise<ActionResult> {
  // signInWithOAuth() does not check this: it would happily return a URL to
  // Supabase's /authorize endpoint, which answers with a raw JSON 400 that the
  // user sees instead of the app.
  if (!(await isProviderEnabled("google"))) {
    return fail(
      "Google sign-in isn't enabled for this project yet. Use your email and password, or enable Google under Authentication -> Providers in Supabase.",
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: absoluteUrl(
        `/auth/callback?next=${encodeURIComponent(safeNext(next))}`,
      ),
    },
  });

  if (error || !data.url) {
    return fail(
      "Google sign-in is unavailable. Check that the provider is enabled in Supabase, or use your email and password.",
    );
  }

  // Leaves the app entirely, so nothing after this runs.
  redirect(data.url);
}

export async function register(input: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the errors below.", zodFieldErrors(parsed.error));
  }

  const { email, password, fullName } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // full_name is read by the handle_new_user() trigger. The trigger hard-codes
      // the role, so nothing here can request elevated privileges.
      data: { full_name: fullName },
      emailRedirectTo: absoluteUrl("/auth/confirm?next=/dashboard"),
    },
  });

  if (error) {
    return fail(error.message);
  }

  // Supabase returns a user with an empty identities array when the address is
  // already registered, rather than erroring — this keeps signup from becoming
  // an account-enumeration oracle. Report success either way.
  const alreadyRegistered = data.user?.identities?.length === 0;
  if (alreadyRegistered) {
    return ok();
  }

  // When "Confirm email" is disabled in Supabase, signUp returns a live session
  // and the user is already signed in. Telling them to check their inbox would
  // be wrong, and no email is ever sent. Send them straight into the app.
  if (data.session) {
    redirect("/dashboard");
  }

  return ok();
}

export async function resendVerification(input: unknown): Promise<ActionResult> {
  const parsed = resendVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Enter a valid email address.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: absoluteUrl("/auth/confirm?next=/dashboard") },
  });

  // Rate limiting is the one failure worth surfacing — otherwise the user just
  // clicks again and wonders why nothing arrives.
  if (error && error.status === 429) {
    return fail("Too many requests. Wait a minute before requesting another email.");
  }

  return ok();
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Enter a valid email address.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: absoluteUrl("/auth/confirm?next=/reset-password"),
  });

  if (error && error.status === 429) {
    return fail("Too many requests. Wait a minute before trying again.");
  }

  // Always report success. Reporting "no such account" would let anyone test
  // which addresses are registered.
  return ok();
}

export async function resetPassword(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the errors below.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  // updateUser only succeeds with a valid recovery session, which is established
  // by /auth/confirm. Without it this fails, which is the desired behaviour for
  // someone visiting /reset-password directly.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return fail(
      "Your password reset link has expired or is invalid. Request a new one.",
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "same_password") {
      return fail("Choose a password different from your current one.");
    }
    return fail(error.message);
  }

  redirect("/dashboard");
}
