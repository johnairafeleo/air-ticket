import { STATUS_LABELS } from "@/lib/tickets/constants";
import { displayName } from "@/lib/users";
import type { NotificationWithContext } from "@/types/app";

/**
 * One line of prose for a notification.
 *
 * Shared by the bell and the history page rather than living in either: two
 * copies would drift, and a notification that reads one way in the dropdown and
 * another way on the page looks like two different events.
 *
 * No `server-only` marker — both callers are Client Components, and this is a
 * pure function of data they already hold.
 */
export function describeNotification(n: NotificationWithContext): string {
  const who = n.actor ? displayName(n.actor) : "Someone";

  switch (n.type) {
    case "STATUS_CHANGED":
      return `${who} moved it${
        n.from_status ? ` from ${STATUS_LABELS[n.from_status]}` : ""
      }${n.to_status ? ` to ${STATUS_LABELS[n.to_status]}` : ""}`;
    case "ASSIGNED":
      return `${who} assigned this to you`;
    case "UNASSIGNED":
      return `${who} removed you from this`;
  }
}

/** Title line: the ticket, or an honest placeholder when it is out of reach. */
export function notificationSubject(n: NotificationWithContext): string {
  // The ticket embed comes back null when RLS hides it — losing project access
  // after the notification was written, or the ticket being soft-deleted.
  return n.ticket
    ? `${n.ticket.ticket_number} · ${n.ticket.title}`
    : "A ticket you no longer have access to";
}
