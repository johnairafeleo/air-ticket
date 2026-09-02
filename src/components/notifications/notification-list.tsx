"use client";

import { useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import { CheckCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/(app)/notifications/actions";
import {
  describeNotification,
  notificationSubject,
} from "@/lib/notifications/describe";
import { initialsOf } from "@/lib/users";
import { cn } from "@/lib/utils";
import type { NotificationWithContext } from "@/types/app";

/**
 * The full notification history.
 *
 * A Client Component only because the rows need click handlers — the data is
 * fetched and paginated on the server and handed down. No local copy of the
 * list is kept: every action revalidates the layout, so the server is the one
 * source of truth for both the rows and the bell's badge.
 */
export function NotificationList({
  items,
  unread,
}: {
  items: NotificationWithContext[];
  unread: number;
}) {
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error ?? "Something went wrong.");
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-16 text-center">
        <p className="text-sm font-medium">No notifications yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          When a ticket you raised or were assigned to moves, it shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {unread > 0 ? (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(markAllNotificationsRead)}
          >
            <CheckCheck aria-hidden />
            Mark all {unread} read
          </Button>
        </div>
      ) : null}

      <ul className="divide-y rounded-lg border">
        {items.map((n) => (
          <li
            key={n.id}
            className={cn(
              "flex items-start gap-3 px-4 py-3",
              !n.read_at && "bg-accent/40",
            )}
          >
            <Avatar className="mt-0.5 size-8 shrink-0">
              {n.actor?.avatar_url ? (
                <AvatarImage src={n.actor.avatar_url} alt="" />
              ) : null}
              <AvatarFallback className="text-[10px]">
                {n.actor ? initialsOf(n.actor) : "?"}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              {/* A ticket that RLS now hides has no id to link to, so the
                  subject degrades to plain text rather than a dead link. */}
              {n.ticket ? (
                <Link
                  href={`/tickets/${n.ticket.id}`}
                  className="truncate text-sm font-medium hover:underline"
                  onClick={() => {
                    if (!n.read_at) {
                      run(() =>
                        markNotificationRead({ notificationId: n.id }),
                      );
                    }
                  }}
                >
                  {notificationSubject(n)}
                </Link>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">
                  {notificationSubject(n)}
                </span>
              )}

              <p className="text-sm text-muted-foreground">
                {describeNotification(n)}
              </p>
              <p
                className="text-xs text-muted-foreground/70"
                title={format(new Date(n.created_at), "d MMM yyyy, HH:mm")}
              >
                {formatDistanceToNow(new Date(n.created_at), {
                  addSuffix: true,
                })}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {!n.read_at ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={pending}
                  onClick={() =>
                    run(() => markNotificationRead({ notificationId: n.id }))
                  }
                >
                  Mark read
                </Button>
              ) : null}

              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={pending}
                aria-label="Dismiss notification"
                onClick={() =>
                  run(() => dismissNotification({ notificationId: n.id }))
                }
              >
                <X aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
