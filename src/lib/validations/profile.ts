import * as z from "zod";

import { USER_ROLES } from "@/types/app";

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: "Enter your full name." })
    .max(120, { error: "That name is too long." }),
  avatarUrl: z
    .union([z.url({ error: "Enter a valid image URL." }).max(2048), z.literal("")])
    .transform((value) => (value === "" ? null : value)),
});

/** Admin-only: change another user's role. */
export const updateUserRoleSchema = z.object({
  userId: z.uuid({ error: "Invalid user." }),
  role: z.enum(USER_ROLES, { error: "Select a valid role." }),
});

/** Admin-only: activate or deactivate another user. */
export const setUserActiveSchema = z.object({
  userId: z.uuid({ error: "Invalid user." }),
  isActive: z.boolean(),
});

/**
 * `avatarUrl` is transformed from "" to null, so the form's input and output
 * types differ. React Hook Form needs both: the fields hold `UpdateProfileInput`
 * and the submit handler receives `UpdateProfileValues`.
 */
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type UpdateProfileValues = z.output<typeof updateProfileSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;
