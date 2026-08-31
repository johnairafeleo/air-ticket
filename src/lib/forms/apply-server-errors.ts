import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import type { ActionResult } from "@/lib/actions/result";

/**
 * Surfaces a Server Action's field errors on the matching form inputs.
 *
 * The server re-validates with the same schema the client used, so a failure
 * here normally means the two disagreed about something (a race, a stale tab)
 * — showing it inline is far more useful than a generic toast.
 *
 * Returns the message that still needs a toast, or null if every error landed
 * on a field.
 */
export function applyServerErrors<TValues extends FieldValues>(
  result: Extract<ActionResult<unknown>, { ok: false }>,
  setError: UseFormSetError<TValues>,
): string | null {
  const { fieldErrors } = result;

  if (!fieldErrors || Object.keys(fieldErrors).length === 0) {
    return result.error;
  }

  let placed = false;

  for (const [name, messages] of Object.entries(fieldErrors)) {
    const message = messages?.[0];
    if (!message || name === "_form") continue;

    setError(name as Path<TValues>, { type: "server", message });
    placed = true;
  }

  return placed ? null : result.error;
}
