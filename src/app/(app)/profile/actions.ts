"use server";

import { revalidatePath } from "next/cache";

import { hasPasswordIdentity, requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/actions/result";
import { updateProfileSchema } from "@/lib/validations/profile";
import { changePasswordSchema } from "@/lib/validations/auth";

/**
 * Update the signed-in user's own profile.
 *
 * Note what is *not* in the update: role and is_active. Even if they were added
 * here, the `profiles_guard_role_change` trigger would reject the write — but
 * not sending them keeps the intent obvious.
 */
export async function updateProfile(input: unknown): Promise<ActionResult> {
  const { profile } = await requireUser();

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the errors below.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      avatar_url: parsed.data.avatarUrl,
    })
    // Redundant with RLS, which already restricts this to the caller's own row.
    // Kept so a policy mistake cannot turn into a mass update.
    .eq("id", profile.id);

  if (error) {
    return fail("Could not save your profile. Please try again.");
  }

  // Mirror the name onto auth.users.raw_user_meta_data.
  //
  // handle_new_user() seeds profiles FROM that metadata, but only on INSERT, so
  // without this the two drift apart the first time someone renames themselves:
  // the app shows the new name while the Supabase dashboard's "Display name"
  // column still shows whatever they signed up with.
  //
  // This is cosmetic, and deliberately not trusted anywhere. User metadata is
  // writable by the user themselves, so it can never be an authorization input
  // — role and is_active live in profiles, behind the guard trigger. profiles
  // stays the source of truth; this copy only exists so the dashboard agrees.
  //
  // Best-effort on purpose: the profile is already saved, and failing the whole
  // action over an out-of-date admin-panel column would be the wrong trade.
  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      full_name: parsed.data.fullName,
      avatar_url: parsed.data.avatarUrl,
    },
  });

  if (metadataError) {
    console.error(
      `[profile] Saved profiles.full_name for ${profile.id} but could not mirror ` +
        `it to auth user metadata: ${metadataError.message}. The app is correct; ` +
        "only the Supabase dashboard's Display name column will be stale.",
    );
  }

  // The topbar and sidebar render the profile, so refresh the whole shell.
  revalidatePath("/", "layout");

  return ok();
}

/**
 * Change the signed-in user's own password.
 *
 * Two steps, and the first is the important one. `supabase.auth.updateUser()`
 * sets a new password on the strength of the session cookie alone — it never
 * asks what the old one was. So this re-authenticates with the current password
 * first: without that, anyone who found an unlocked browser could lock the real
 * owner out of the account. Supabase rate-limits the sign-in endpoint, which
 * also caps how fast the current password could be guessed here.
 *
 * A successful re-authentication issues a fresh session; because it is the same
 * user on the same cookie-bound client, that simply replaces the caller's own
 * session and they stay signed in.
 */
export async function changePassword(input: unknown): Promise<ActionResult> {
  const { user, profile } = await requireUser();

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the errors below.", zodFieldErrors(parsed.error));
  }

  if (!hasPasswordIdentity(user)) {
    return fail(
      "This account signs in with Google, so there is no password to change.",
    );
  }

  const supabase = await createClient();

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: parsed.data.currentPassword,
  });

  if (reauthError) {
    if (reauthError.code === "invalid_credentials") {
      return fail("Please correct the errors below.", {
        currentPassword: ["That is not your current password."],
      });
    }
    return fail(reauthError.message);
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    // The schema already rejects "new === current", so this only fires when
    // Supabase compares against a password history we cannot see.
    if (error.code === "same_password") {
      return fail("Please correct the errors below.", {
        password: ["Choose a password different from your current one."],
      });
    }
    return fail(error.message);
  }

  return ok();
}
