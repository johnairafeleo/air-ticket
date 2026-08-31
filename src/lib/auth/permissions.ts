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
 * Mirrors `guard_ticket_change()`, which since 0009 keys off the project role:
 *
 *   system ADMIN     always.
 *   AGENT / MANAGER  any ticket in the project.
 *   MEMBER           only their own, and only while still OPEN. Once work has
 *                    started, the wording is part of the record.
 *   VIEWER           never.
 *
 * The database enforces all of this regardless; this only decides whether to
 * offer the button.
 */
export function canEditTicketDetails(
  actor: TicketActor,
  ticket: Pick<Ticket, "created_by" | "status">,
): boolean {
  if (actor.isSystemAdmin) return true;
  if (actor.projectRole === "AGENT" || actor.projectRole === "MANAGER") {
    return true;
  }
  if (actor.projectRole === "MEMBER") {
    return ticket.created_by === actor.id && ticket.status === "OPEN";
  }
  return false;
}
