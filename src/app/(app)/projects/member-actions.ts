"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/actions/result";
import {
  addMemberSchema,
  removeMemberSchema,
  updateMemberRoleSchema,
} from "@/lib/validations/member";

/**
 * Project membership mutations.
 *
 * Authorization is enforced by RLS: only a project MANAGER or a system admin
 * satisfies the policies on `project_members`. These actions add readable
 * errors, not the guarantee.
 */

function describeMemberError(message: string): string {
  if (message.includes("at least one manager")) {
    return "A project must keep at least one manager.";
  }
  if (message.includes("row-level security")) {
    return "Only a project manager can change membership.";
  }
  if (message.includes("duplicate key")) {
    return "That person is already a member of this project.";
  }
  return "Could not apply that change. Please try again.";
}

/**
 * Add someone by email.
 *
 * They must already have an account — we deliberately do not reveal whether an
 * address exists beyond this project's context, and there is no invitation
 * email flow yet.
 */
export async function addProjectMember(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = addMemberSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the errors below.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();

  // Profiles are no longer broadly readable — since 0013 you only see people
  // you share a project with — so a direct select would fail for exactly the
  // people you are trying to invite. This RPC resolves one exact address and
  // returns only an id, so it cannot be used to enumerate users.
  const { data: userId } = await supabase.rpc("find_user_by_email", {
    p_email: parsed.data.email,
  });

  if (!userId) {
    return fail(
      "No account with that email. They need to sign up before being added.",
      { email: ["No account found for this address."] },
    );
  }

  const { error } = await supabase.from("project_members").insert({
    project_id: parsed.data.projectId,
    user_id: userId,
    role: parsed.data.role,
  });

  if (error) return fail(describeMemberError(error.message));

  revalidatePath("/", "layout");
  return ok();
}

export async function updateMemberRole(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = updateMemberRoleSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .update({ role: parsed.data.role })
    .eq("project_id", parsed.data.projectId)
    .eq("user_id", parsed.data.userId);

  if (error) return fail(describeMemberError(error.message));

  revalidatePath("/", "layout");
  return ok();
}

export async function removeProjectMember(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", parsed.data.projectId)
    .eq("user_id", parsed.data.userId);

  if (error) return fail(describeMemberError(error.message));

  revalidatePath("/", "layout");
  return ok();
}
