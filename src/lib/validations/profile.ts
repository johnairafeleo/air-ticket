import * as z from "zod";

import { USER_ROLES } from "@/types/app";

/**
 * An optional URL, stored as null when blank.
 *
 * The three accepted input shapes are deliberate, because this schema validates
 * the SAME value twice. The form field holds "" while it is empty; the
 * transform turns that into null; the client then submits the transformed
 * object to the Server Action, which re-validates it — and so sees null, never
 * "". A shape that only accepted a URL or "" therefore rejected every blank
 * avatar on the server with the union's generic "Invalid input", making an
 * optional field impossible to leave empty. Accepting null (and undefined)
 * closes that round trip.
 *
 * Trimming first means a field containing only spaces counts as blank rather
 * than as an invalid URL.
 */
const optionalUrl = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => value?.trim() ?? "")
  .pipe(
    z.union([
      z
        .url({ error: "Enter a valid image URL." })
        .max(2048, { error: "That URL is too long." }),
      z.literal(""),
    ]),
  )
  .transform((value) => (value === "" ? null : value));

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { error: "Enter your full name." })
    .max(120, { error: "That name is too long." }),
  avatarUrl: optionalUrl,
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
