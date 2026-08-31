import * as z from "zod";

/**
 * Project validation schemas.
 *
 * These live here, not beside the Server Actions, because a `"use server"`
 * module may only export async functions — exporting a schema object from one
 * is a runtime error. The client dialogs and the actions both import from here.
 */

/** Matches the projects_key_format CHECK constraint in 0005. */
export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, {
    error: "2–10 characters, letters and digits, starting with a letter.",
  });

export const createProjectSchema = z.object({
  key: projectKeySchema,
  name: z
    .string()
    .trim()
    .min(2, { error: "Give the project a name." })
    .max(80, { error: "Name must be 80 characters or fewer." }),
  description: z
    .string()
    .trim()
    .max(500, { error: "Description must be 500 characters or fewer." })
    .optional(),
});

export const updateProjectSchema = z.object({
  projectId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(2, { error: "Give the project a name." })
    .max(80, { error: "Name must be 80 characters or fewer." }),
  description: z
    .string()
    .trim()
    .max(500, { error: "Description must be 500 characters or fewer." })
    .optional(),
  isActive: z.boolean(),
});

// The app is always scoped to exactly one project, so switching always names a
// real one — there is no "all" sentinel any more.
export const setActiveProjectSchema = z.object({
  projectId: z.uuid(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
