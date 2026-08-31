"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { canChangeRoleOf, canSetActiveStateOf } from "@/lib/auth/permissions";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/actions/result";
import { setUserActiveSchema, updateUserRoleSchema } from "@/lib/validations/profile";

/**
 * Admin user-management actions.
 *
 * Three independent layers have to agree before a role changes:
 *   1. `requireRole("ADMIN")` — is the caller an admin at all?
 *   2. `canChangeRoleOf()`    — is this specific change allowed?
 *   3. The database trigger   — the authority, including the last-admin rule.
 *
 * The first two produce good error messages. The third is what actually makes
 * the guarantee, because it also applies to anyone talking to Supabase directly.
 */

/** Map a Postgres exception from the guard trigger onto a readable message. */
function describeGuardError(message: string): string {
  if (message.includes("last active administrator")) {
    return "This is the last active administrator. Promote someone else first.";
  }
  if (message.includes("Only administrators")) {
    return "You do not have permission to make that change.";
  }
  return "Could not apply that change. Please try again.";
}

export async function updateUserRole(input: unknown): Promise<ActionResult> {
  const { profile: actor } = await requireRole("ADMIN");

  const parsed = updateUserRoleSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Invalid request.", zodFieldErrors(parsed.error));
  }

  const { userId, role } = parsed.data;
  const supabase = await createClient();

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (targetError || !target) {
    return fail("That user no longer exists.");
  }

  if (!canChangeRoleOf(actor, target)) {
    return fail("You cannot change your own role.");
  }

  if (target.role === role) {
    return ok();
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) {
    return fail(describeGuardError(error.message));
  }

  revalidatePath("/admin/users");
  return ok();
}

export async function setUserActive(input: unknown): Promise<ActionResult> {
  const { profile: actor } = await requireRole("ADMIN");

  const parsed = setUserActiveSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Invalid request.", zodFieldErrors(parsed.error));
  }

  const { userId, isActive } = parsed.data;
  const supabase = await createClient();

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (targetError || !target) {
    return fail("That user no longer exists.");
  }

  if (!canSetActiveStateOf(actor, target)) {
    return fail("You cannot deactivate your own account.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) {
    return fail(describeGuardError(error.message));
  }

  revalidatePath("/admin/users");
  return ok();
}
