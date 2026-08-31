/**
 * Uniform return shape for Server Actions.
 *
 * Actions return a result rather than throwing, so forms can render a message
 * instead of tripping the error boundary. Genuinely exceptional failures still
 * throw.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok(): ActionResult;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/**
 * Turns a Zod error into field-level messages for React Hook Form.
 * Keeps the shape identical to what the client-side resolver produces.
 */
export function zodFieldErrors(error: {
  issues: readonly { path: PropertyKey[]; message: string }[];
}): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return fieldErrors;
}
