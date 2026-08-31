import * as z from "zod";

import { PROJECT_ROLES } from "@/types/app";

/**
 * Project membership schemas.
 *
 * In their own module rather than beside the actions: a `"use server"` file may
 * only export async functions, so exporting a schema from one is a runtime
 * error.
 */

export const addMemberSchema = z.object({
  projectId: z.uuid(),
  email: z
    .email({ error: "Enter a valid email address." })
    .trim()
    .toLowerCase(),
  role: z.enum(PROJECT_ROLES, { error: "Choose a role." }),
});

export const updateMemberRoleSchema = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(PROJECT_ROLES, { error: "Choose a role." }),
});

export const removeMemberSchema = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
