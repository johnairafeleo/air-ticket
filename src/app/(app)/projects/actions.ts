"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireRole, requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/actions/result";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/projects/active";
import {
  createProjectSchema,
  setActiveProjectSchema,
  updateProjectSchema,
} from "@/lib/validations/project";

/**
 * Project mutations.
 *
 * A `"use server"` module may only export async functions, so the Zod schemas
 * live in `@/lib/validations/project` and are imported by both this file and
 * the client dialogs.
 */

/**
 * Switch the project scoping the app.
 *
 * Any signed-in user may do this — it only changes what they are looking at,
 * and RLS still decides which tickets they can see within it.
 */
export async function setActiveProject(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = setActiveProjectSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid project.");

  const store = await cookies();
  store.set(ACTIVE_PROJECT_COOKIE, parsed.data.projectId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // A year: this is a display preference, not a credential.
    maxAge: 60 * 60 * 24 * 365,
  });

  // Every scoped view has to re-render with the new selection.
  revalidatePath("/", "layout");
  return ok();
}

export async function createProject(input: unknown): Promise<ActionResult> {
  await requireRole("ADMIN");

  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the errors below.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("projects").insert({
    key: parsed.data.key,
    name: parsed.data.name,
    description: parsed.data.description || null,
  });

  if (error) {
    // 23505 is a unique violation; both key and name are unique.
    if (error.code === "23505") {
      return fail("A project with that key or name already exists.");
    }
    return fail("Could not create the project.");
  }

  revalidatePath("/", "layout");
  return ok();
}

export async function updateProject(input: unknown): Promise<ActionResult> {
  await requireRole("ADMIN");

  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the errors below.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      is_active: parsed.data.isActive,
    })
    // The key is deliberately not updatable: existing ticket numbers embed it,
    // so changing it would make them disagree with their project.
    .eq("id", parsed.data.projectId);

  if (error) {
    if (error.code === "23505") {
      return fail("Another project already uses that name.");
    }
    return fail("Could not update the project.");
  }

  revalidatePath("/", "layout");
  return ok();
}
