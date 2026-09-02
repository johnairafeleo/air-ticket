import type { TicketActor } from "@/types/app";

/**
 * Pure project-role predicates.
 *
 * Deliberately NOT in `@/lib/projects/access`, which carries `server-only`
 * because it queries the database. These are pure functions of a TicketActor,
 * and Client Components need them too.
 *
 * That distinction is the whole point of this file. Before it existed, three
 * client-side callers — `ticket-controls`, `ticket-board` and
 * `availableStatuses` — each re-implemented these rules inline, because they
 * could not import from a `server-only` module. When 0017 widened MEMBER, all
 * three kept the old narrower rule and silently disagreed with the database:
 * members were refused drag-and-drop and assignment that Postgres would have
 * allowed. Anything role-shaped that a Client Component needs belongs here, not
 * copied into the component.
 *
 * These mirror the SQL helpers of the same names. The database is the
 * authority; these only decide whether to offer a control.
 */

/** Works the queue: MEMBER, AGENT, MANAGER, or a system admin. */
export function isProjectStaff(actor: TicketActor): boolean {
  return (
    actor.isSystemAdmin ||
    actor.projectRole === "MEMBER" ||
    actor.projectRole === "AGENT" ||
    actor.projectRole === "MANAGER"
  );
}

/**
 * Administers the project itself: settings, and handing work to other people.
 *
 * Since 0017 this does NOT include membership. The two were one predicate until
 * MEMBER was widened, at which point keeping them merged would have handed
 * every member the ability to add and remove people. Use canManageMembers() for
 * anything that changes who is in the project.
 */
export function canManageProject(actor: TicketActor): boolean {
  return (
    actor.isSystemAdmin ||
    actor.projectRole === "MEMBER" ||
    actor.projectRole === "MANAGER"
  );
}

/** Adds and removes people, and changes their roles. MANAGER or system admin. */
export function canManageMembers(actor: TicketActor): boolean {
  return actor.isSystemAdmin || actor.projectRole === "MANAGER";
}

/** May raise a ticket here. A VIEWER is read-only. */
export function canCreateTickets(actor: TicketActor): boolean {
  return isProjectStaff(actor);
}

/** Hands work to someone else. Mirrors ticket_assignees_insert. */
export function canAssignToOthers(actor: TicketActor): boolean {
  return canManageProject(actor);
}
