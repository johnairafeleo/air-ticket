import type { Profile, Ticket, TicketActor, UserRole } from "@/types/app";

/**
 * Pure permission predicates.
 *
 * These mirror the RLS policies in `supabase/migrations/` and exist so the UI
 * can hide what the database would reject, and so Server Actions can fail with
 * a readable message instead of an empty result set.
 *
 * They are NOT the security boundary. Postgres RLS is. Never rely on these
 * alone — a caller can always talk to Supabase directly with the anon key.
 */

export const ROLE_LABELS: Record<UserRole, string> = {
  USER: "User",
  AGENT: "Agent",
  ADMIN: "Admin",
};

/** Role ranking, for "at least this role" checks. */
const ROLE_RANK: Record<UserRole, number> = {
  USER: 0,
  AGENT: 1,
  ADMIN: 2,
};

export function hasAtLeastRole(profile: Profile, role: UserRole): boolean {
  return profile.is_active && ROLE_RANK[profile.role] >= ROLE_RANK[role];
}

export function isAdmin(profile: Profile): boolean {
  return profile.is_active && profile.role === "ADMIN";
}

export function isAgent(profile: Profile): boolean {
  return profile.is_active && profile.role === "AGENT";
}

/** Admin area: user list, role management, categories, system settings. */
export function canManageUsers(profile: Profile): boolean {
  return isAdmin(profile);
}

export function canManageRoles(profile: Profile): boolean {
  return isAdmin(profile);
}

/**
 * Whether `actor` may change `target`'s role.
 *
 * Self-edits are refused here as well as in the database trigger: an admin
 * demoting themselves is nearly always a mistake, and the last-admin lockout
 * rule is easier to reason about when nobody edits their own role.
 */
export function canChangeRoleOf(actor: Profile, target: Profile): boolean {
  return canManageRoles(actor) && actor.id !== target.id;
}

/** Whether `actor` may activate or deactivate `target`. */
export function canSetActiveStateOf(actor: Profile, target: Profile): boolean {
  return isAdmin(actor) && actor.id !== target.id;
}

/** Agents and admins can be assigned tickets. Used from Phase 2 onward. */
export function isAssignable(profile: Profile): boolean {
  return profile.is_active && hasAtLeastRole(profile, "AGENT");
}

export function canAssignTickets(profile: Profile): boolean {
  return isAdmin(profile);
}

export function canViewAllTickets(profile: Profile): boolean {
  return isAdmin(profile);
}

/**
 * Whether `actor` may edit a ticket's title and description.
 *
 * Mirrors `guard_ticket_change()`, which keys off the project role:
 *
 *   system ADMIN              always.
 *   MEMBER / AGENT / MANAGER  any ticket in the project.
 *   VIEWER                    never.
 *
 * MEMBER was restricted to its own tickets, and only while still OPEN, until
 * 0017 made it a project administrator. That removed the last rule that
 * depended on the ticket itself, so this now takes only the actor — add the
 * ticket back if a per-ticket rule ever returns.
 *
 * The database enforces all of this regardless; this only decides whether to
 * offer the button.
 */
export function canEditTicketDetails(actor: TicketActor): boolean {
  if (actor.isSystemAdmin) return true;
  return (
    actor.projectRole === "MEMBER" ||
    actor.projectRole === "AGENT" ||
    actor.projectRole === "MANAGER"
  );
}

/**
 * Whether `actor` may delete this ticket.
 *
 * Mirrors the `tickets_delete` policy from 0019:
 *
 *   system ADMIN       always.
 *   MEMBER / MANAGER   any ticket in the project — they administer it.
 *   the creator        their own, but only while it is still OPEN.
 *   AGENT / VIEWER     never, unless it is their own and still OPEN.
 *
 * Note an AGENT works the queue but does not administer the project, so an
 * agent cannot delete other people's tickets. That is deliberate and matches
 * the policy; deletion is destructive in a way that changing a status is not.
 */
export function canDeleteTicket(
  actor: TicketActor,
  ticket: Pick<Ticket, "created_by" | "status">,
): boolean {
  if (actor.isSystemAdmin) return true;

  if (actor.projectRole === "MEMBER" || actor.projectRole === "MANAGER") {
    return true;
  }

  return ticket.created_by === actor.id && ticket.status === "OPEN";
}
