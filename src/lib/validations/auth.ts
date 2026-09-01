import * as z from "zod";

/**
 * Auth validation schemas.
 *
 * Shared by React Hook Form on the client (for immediate feedback) and by the
 * Server Actions (which are authoritative). One definition, so the two cannot
 * disagree about what is valid.
 */

const email = z
  .email({ error: "Enter a valid email address." })
  .trim()
  .toLowerCase()
  .max(254, { error: "That email address is too long." });

/**
 * Password rules. Supabase enforces a minimum length server-side too, but
 * stating them here gives the user specific feedback instead of a generic
 * rejection after a round trip.
 */
const password = z
  .string()
  .min(10, { error: "Password must be at least 10 characters." })
  .max(72, { error: "Password must be at most 72 characters." })
  .regex(/[a-z]/, { error: "Password must contain a lowercase letter." })
  .regex(/[A-Z]/, { error: "Password must contain an uppercase letter." })
  .regex(/[0-9]/, { error: "Password must contain a number." });

export const loginSchema = z.object({
  email,
  // Deliberately lax: existing accounts may predate the current rules, and
  // telling someone their password is "invalid" at login leaks nothing useful.
  password: z.string().min(1, { error: "Enter your password." }),
});

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, { error: "Enter your full name." })
      .max(120, { error: "That name is too long." }),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const resendVerificationSchema = z.object({ email });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

/**
 * Changing your own password while signed in.
 *
 * `currentPassword` is not something Supabase requires — `updateUser()` will
 * change the password on the strength of the session alone. It is here because
 * that is exactly the problem: without it, anyone who reached an unlocked
 * browser could take the account over. Proving knowledge of the existing
 * password is what stops that, and the Server Action verifies it for real.
 *
 * Lax on `currentPassword` for the same reason as login: an old account may
 * predate the current rules.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Enter your current password." }),
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.password !== data.currentPassword, {
    error: "Choose a password different from your current one.",
    path: ["password"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
