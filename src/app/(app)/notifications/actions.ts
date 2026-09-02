"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/actions/result";

/**
 * Notification mutations.
 *
 * Every one of these is scoped by RLS to the caller's own rows, and the
 * `guard_notification_change()` trigger restricts updates to `read_at`. So
 * these actions do not re-check ownership: there is no query they could write
 * that would touch somebody else's inbox.
 */

// Shared by mark-read and dismiss: both address a single notification by id.
const notificationIdSchema = z.object({ notificationId: z.uuid() });

export async function markNotificationRead(
  input: unknown,
): Promise<ActionResult> {
  await requireUser();

  const parsed = notificationIdSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data.notificationId)
    // Already-read rows are skipped so re-reading the inbox does not keep
    // moving the timestamp forward.
    .is("read_at", null);

  if (error) return fail("Could not update that notification.");

  revalidatePath("/", "layout");
  return ok();
}

/**
 * Remove one notification.
 *
 * A real DELETE, unlike tickets: a notification is a copy of something that
 * already happened, so discarding it loses nothing. The ticket, its status and
 * its assignments are all still there.
 */
export async function dismissNotification(
  input: unknown,
): Promise<ActionResult> {
  await requireUser();

  const parsed = notificationIdSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("notifications")
    .delete({ count: "exact" })
    .eq("id", parsed.data.notificationId);

  if (error) return fail("Could not dismiss that notification.");

  // A DELETE that RLS refuses is not an error — PostgREST reports success
  // having removed nothing. Without this the UI would report a dismissal that
  // never happened, which is exactly how a row appears to come back.
  if ((count ?? 0) === 0) {
    return fail("That notification no longer exists.");
  }

  revalidatePath("/", "layout");
  return ok();
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) return fail("Could not mark your notifications as read.");

  revalidatePath("/", "layout");
  return ok();
}
