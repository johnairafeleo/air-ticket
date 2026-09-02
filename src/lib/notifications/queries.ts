import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { NotificationWithContext } from "@/types/app";

/**
 * Notification reads.
 *
 * RLS restricts `notifications` to `user_id = auth.uid()`, so none of these
 * filter by user — the database has already done it, and adding a redundant
 * `.eq("user_id", …)` here would invite the belief that it is what protects the
 * inbox.
 */

/** How many the bell shows before it stops counting precisely. */
export const NOTIFICATION_PAGE_SIZE = 20;

const NOTIFICATION_SELECT = [
  "*",
  "ticket:tickets(id,ticket_number,title)",
  "actor:profiles!notifications_actor_id_fkey(id,full_name,email,avatar_url)",
].join(",");

/** The most recent notifications for the signed-in user, newest first. */
export const listNotifications = cache(
  async (limit = NOTIFICATION_PAGE_SIZE): Promise<NotificationWithContext[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data ?? []) as unknown as NotificationWithContext[];
  },
);

export type NotificationPage = {
  items: NotificationWithContext[];
  total: number;
  page: number;
  pageCount: number;
};

/** How many the history page shows at a time. */
export const NOTIFICATIONS_PER_PAGE = 30;

/**
 * A page of the full history, for /notifications.
 *
 * Deliberately not a parameter on `listNotifications()`. That one is `cache()`d
 * and runs on every render of the shell; making it paginated would mean a
 * memoized function whose key did not include the page, so page 2 would be
 * served page 1's rows.
 */
export async function listNotificationPage(
  page = 1,
): Promise<NotificationPage> {
  const supabase = await createClient();
  const from = (page - 1) * NOTIFICATIONS_PER_PAGE;

  const { data, error, count } = await supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + NOTIFICATIONS_PER_PAGE - 1);

  if (error) return { items: [], total: 0, page, pageCount: 1 };

  const total = count ?? 0;

  return {
    items: (data ?? []) as unknown as NotificationWithContext[],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / NOTIFICATIONS_PER_PAGE)),
  };
}

/**
 * Unread count for the badge.
 *
 * `head: true` so Postgres returns the count without the rows — this runs on
 * every render of the shell.
 */
export const unreadNotificationCount = cache(async (): Promise<number> => {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) return 0;
  return count ?? 0;
});
