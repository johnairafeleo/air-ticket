"use client";

import { useCallback, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/(app)/notifications/actions";
import {
  describeNotification,
  notificationSubject,
} from "@/lib/notifications/describe";
import { cn } from "@/lib/utils";
import type { NotificationWithContext } from "@/types/app";

/**
 * Realtime notification bell.
 *
 * The initial list and count are rendered on the server and handed in, so the
 * badge is correct on first paint rather than appearing a moment later. From
 * then on a Supabase Realtime subscription pushes new rows in.
 *
 * The subscription filters on `user_id`, which is the same condition the RLS
 * policy enforces — the filter is for efficiency, not for privacy. Postgres
 * would refuse to send another user's row regardless.
 *
 * A new notification means the underlying data changed too, so `router.refresh()`
 * re-renders the server components (board, list, dashboard counts) rather than
 * leaving a stale page behind a fresh badge.
 */
export function NotificationBell({
  userId,
  items,
  unread,
}: {
  userId: string;
  items: NotificationWithContext[];
  unread: number;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Deliberately no local copy of `items` or `unread`. Both are server state,
  // and every path that changes them ends in router.refresh() — mirroring them
  // into useState would mean two sources of truth that drift the moment another
  // tab marks something read.

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    // The Realtime socket authenticates separately from the REST client: it
    // carries its own token, and `createBrowserClient` loads the session from
    // cookies asynchronously. Subscribing straight away can therefore join the
    // channel before the token is attached, and an anonymous join fails every
    // RLS check — the subscription reports SUBSCRIBED and then silently
    // delivers nothing, which is exactly the "I have to refresh" symptom.
    //
    // So: wait for the session, hand the token to the socket, and only then
    // subscribe.
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session?.access_token) {
        console.error(
          "[notifications] No Supabase session in the browser; realtime " +
            "cannot authenticate and no notifications will arrive.",
        );
        return;
      }

      await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            // The realtime payload is the raw row — no embedded ticket or
            // actor, because Postgres replication carries columns, not joins.
            // So it is used only to word the toast; the refresh below brings
            // the fully joined list and the new count back from the server.
            const row = payload.new as { type?: string };

            toast.info(
              row.type === "ASSIGNED"
                ? "A ticket was assigned to you."
                : row.type === "UNASSIGNED"
                  ? "You were removed from a ticket."
                  : "A ticket you follow has moved.",
            );
            router.refresh();
          },
        )
        // Without a status callback a broken subscription is indistinguishable
        // from a quiet one, which is what made this hard to diagnose the first
        // time. CHANNEL_ERROR here usually means Realtime is disabled for the
        // project, or the table is not in the supabase_realtime publication.
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(`[notifications] realtime ${status}`, err);
          }
        });
    })();

    return () => {
      cancelled = true;
      // Without this, navigating away and back opens a second channel and every
      // notification arrives twice.
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, router]);

  const openTicket = useCallback(
    (n: NotificationWithContext) => {
      // The action revalidates the layout, so the badge and the row's unread
      // dot both settle from the server rather than being nudged here.
      if (!n.read_at) {
        startTransition(async () => {
          await markNotificationRead({ notificationId: n.id });
        });
      }
      if (n.ticket) router.push(`/tickets/${n.ticket.id}`);
    },
    [router],
  );

  function markAll() {
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
        >
          <Bell aria-hidden />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={pending}
              onClick={markAll}
            >
              <CheckCheck aria-hidden />
              Mark all read
            </Button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Changes to your tickets will show up here.
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openTicket(n)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent",
                    !n.read_at && "bg-accent/40",
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="truncate text-xs font-medium">
                      {notificationSubject(n)}
                    </span>
                    {!n.read_at ? (
                      <span
                        className="ml-auto size-2 shrink-0 rounded-full bg-primary"
                        aria-label="Unread"
                      />
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {describeNotification(n)}
                  </span>
                  <span className="text-[11px] text-muted-foreground/70">
                    {formatDistanceToNow(new Date(n.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* The dropdown shows only the most recent handful; everything older
            lives on the history page. */}
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs"
            asChild
          >
            <Link href="/notifications">View all notifications</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
