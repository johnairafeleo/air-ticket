"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/actions/result";
import { updateProfileSchema } from "@/lib/validations/profile";

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

  // The topbar and sidebar render the profile, so refresh the whole shell.
  revalidatePath("/", "layout");

  return ok();
}
