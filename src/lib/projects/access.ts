import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type {
  Profile,
  ProjectMemberWithProfile,
  ProjectRole,
  TicketActor,
} from "@/types/app";

/**
 * Project-scoped authorization.
 *
 * Since 0009, what you may do lives in your role within a project, not your
 * global role. A global ADMIN remains a superuser across every project.
 *
 * These mirror the SQL helpers (`project_role_of`, `is_project_staff`,
 * `can_manage_project`) so the UI offers only what the database will accept.
 * The database is still the authority — nothing here is a security boundary.
 */

/**
 * The caller's role in a project, or null if they are not a member.
 *
 * Uses the project_role_of() RPC rather than reading project_members directly.
 * A direct read has to be filtered by user_id as well as project_id — RLS lets
 * you see EVERY member of your projects, so filtering on project_id alone
 * returns every member and .maybeSingle() then fails, reporting you as a
 * non-member of your own project. The RPC keys off auth.uid() internally, so
 * that mistake is not available, and it is the same function the RLS policies
 * use.
 */
export const getProjectRole = cache(
  async (projectId: string): Promise<ProjectRole | null> => {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("project_role_of", {
      p_project: projectId,
    });

    if (error) return null;
    return data ?? null;
  },
);

/** Bundle the identity and project role that ticket components need. */
export async function getTicketActor(
  profile: Profile,
  projectId: string,
): Promise<TicketActor> {
  return {
    id: profile.id,
    isSystemAdmin: profile.role === "ADMIN",
    projectRole: await getProjectRole(projectId),
  };
}

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
  return (
    actor.isSystemAdmin ||
    actor.projectRole === "MEMBER" ||
    actor.projectRole === "AGENT" ||
    actor.projectRole === "MANAGER"
  );
}

/** Hands work to someone else. Mirrors ticket_assignees_insert. */
export function canAssignToOthers(actor: TicketActor): boolean {
  return canManageProject(actor);
}

/** Everyone in a project, for the members table and assignee pickers. */
export const listProjectMembers = cache(
  async (projectId: string): Promise<ProjectMemberWithProfile[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("project_members")
      .select(
        `*, profile:profiles ( id, full_name, email, avatar_url )`,
      )
      .eq("project_id", projectId)
      .order("role", { ascending: false });

    if (error) return [];
    return (data ?? []) as unknown as ProjectMemberWithProfile[];
  },
);

/**
 * Members who can be assigned tickets — everyone except viewers.
 *
 * Assignment is scoped to the project, so someone who works another project is
 * not offered. MEMBER joined this list in 0017; the matching target check lives
 * in the ticket_assignees_insert policy, and the two must agree or the picker
 * will offer people the database then refuses.
 */
export async function listAssignableMembers(
  projectId: string,
): Promise<ProjectMemberWithProfile[]> {
  const members = await listProjectMembers(projectId);
  return members.filter(
    (m) => m.role === "MEMBER" || m.role === "AGENT" || m.role === "MANAGER",
  );
}

/**
 * What the "New ticket" assignee picker needs, or undefined to hide it.
 *
 * Undefined for a viewer: they cannot be put on a ticket and cannot put anyone
 * else on one either, so the control would only ever fail.
 *
 * Lives here rather than in each page so the roster and the "may I assign
 * others" answer are always derived together — a page that fetched one without
 * the other would render a picker that disagrees with the RLS policy.
 */
export async function getTicketAssigning(
  actor: TicketActor,
  projectId: string,
): Promise<
  | {
      members: ProjectMemberWithProfile[];
      actorId: string;
      canAssignOthers: boolean;
    }
  | undefined
> {
  if (!isProjectStaff(actor)) return undefined;

  return {
    members: await listAssignableMembers(projectId),
    actorId: actor.id,
    canAssignOthers: canAssignToOthers(actor),
  };
}
