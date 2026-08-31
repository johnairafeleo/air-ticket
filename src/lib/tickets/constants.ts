import type { TicketActor, TicketPriority, TicketStatus } from "@/types/app";

/**
 * Ticket display metadata and the client-side view of the status workflow.
 *
 * The transition map below MIRRORS `public.can_transition()` in
 * `supabase/migrations/0002_tickets.sql`. The database is the authority — this
 * copy exists so the UI can grey out impossible options instead of letting the
 * user pick one and get an error. If you change one, change the other.
 */

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  PENDING: "Pending",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

/** Tailwind classes per status. Kept here so badges stay consistent everywhere. */
export const STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  IN_PROGRESS:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  PENDING:
    "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
  RESOLVED:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CLOSED: "border-border bg-muted text-muted-foreground",
};

export const PRIORITY_STYLES: Record<TicketPriority, string> = {
  LOW: "border-border bg-muted text-muted-foreground",
  MEDIUM: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  URGENT: "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300",
};

/** Statuses that mean the ticket is still being worked. */
export const ACTIVE_STATUSES: readonly TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING",
];

/**
 * Everything except CLOSED — i.e. tickets still on someone's plate.
 *
 * Exported as a filter-ready string so dashboard links express exactly the same
 * set the stat counts use. `dashboard_stats()` excludes CLOSED from its
 * "needs attention" figures, and these links must agree with it.
 */
export const NOT_CLOSED_STATUSES: readonly TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING",
  "RESOLVED",
];

export const NOT_CLOSED_PARAM = NOT_CLOSED_STATUSES.join(",");

/** The three statuses that mean active work, as a filter parameter. */
export const ACTIVE_STATUSES_PARAM = ["OPEN", "IN_PROGRESS", "PENDING"].join(",");

/** Board columns, left to right in workflow order. */
export const BOARD_COLUMNS: readonly TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING",
  "RESOLVED",
  "CLOSED",
];

/** Mirror of public.can_transition(). CLOSED is terminal. */
const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "PENDING", "RESOLVED", "CLOSED"],
  PENDING: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/**
 * Statuses `actor` may move this ticket to, given their role IN THIS PROJECT.
 *
 * A VIEWER gets nothing. A MEMBER gets exactly one option — closing their own
 * resolved ticket. Agents, managers and system admins get the full transition
 * set. Mirrors `guard_ticket_change()`; the database rejects anything else
 * regardless of what this returns.
 */
export function availableStatuses(
  actor: TicketActor,
  current: TicketStatus,
  isOwner: boolean,
): readonly TicketStatus[] {
  const isStaff =
    actor.isSystemAdmin ||
    actor.projectRole === "AGENT" ||
    actor.projectRole === "MANAGER";

  if (isStaff) return TRANSITIONS[current];

  if (actor.projectRole === "MEMBER") {
    return isOwner && current === "RESOLVED" ? ["CLOSED"] : [];
  }

  // VIEWER, or not a member at all.
  return [];
}
