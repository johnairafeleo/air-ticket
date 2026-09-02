import type { Metadata } from "next";
import Link from "next/link";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationList } from "@/components/notifications/notification-list";
import { requireUser } from "@/lib/auth/require-user";
import {
  listNotificationPage,
  unreadNotificationCount,
} from "@/lib/notifications/queries";

export const metadata: Metadata = {
  title: "Notifications",
};

/** `?page=` is user input like any other, so it is parsed rather than trusted. */
const pageParam = z.coerce.number().int().min(1).max(1000).catch(1);

export default async function NotificationsPage(
  props: PageProps<"/notifications">,
) {
  // The real gate. RLS scopes notifications to the caller, but an unauthenticated
  // request must not get this far in the first place.
  await requireUser("/notifications");

  const searchParams = await props.searchParams;
  const page = pageParam.parse(searchParams.page);

  const [result, unread] = await Promise.all([
    listNotificationPage(page),
    unreadNotificationCount(),
  ]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          result.total === 0
            ? "Ticket movement and assignments land here."
            : `${result.total} notification${result.total === 1 ? "" : "s"}${
                unread > 0 ? ` · ${unread} unread` : ""
              }`
        }
      />

      <NotificationList items={result.items} unread={unread} />

      {result.pageCount > 1 ? (
        <nav
          className="mt-4 flex items-center justify-between"
          aria-label="Pagination"
        >
          <p className="text-sm text-muted-foreground">
            Page {result.page} of {result.pageCount}
          </p>

          <div className="flex gap-2">
            <PageLink page={result.page - 1} disabled={result.page <= 1}>
              Previous
            </PageLink>
            <PageLink
              page={result.page + 1}
              disabled={result.page >= result.pageCount}
            >
              Next
            </PageLink>
          </div>
        </nav>
      ) : null}
    </>
  );
}

function PageLink({
  page,
  disabled,
  children,
}: {
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`/notifications?page=${page}`}>{children}</Link>
    </Button>
  );
}
