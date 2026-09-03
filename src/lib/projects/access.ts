import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { canAssignToOthers, isProjectStaff } from "@/lib/projects/roles";
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

// The pure role predicates live in ./roles so Client Components can import
// them too — see that file for why the split exists. Re-exported here because
// most server callers want them alongside the queries below.
export {
  canAssignToOthers,
  canCreateTickets,
  canManageMembers,
  canManageProject,
  isProjectStaff,
} from "@/lib/projects/roles";


/** Everyone in a project, for the members table and assignee pickers. */
export const listProjectMembers = cache(
  async (projectId: string): Promise<ProjectMemberWithProfile[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("project_members")
      // Both FK hints are REQUIRED since 0022 added `added_by`: with two
      // foreign keys from this table to profiles, a bare `profiles` embed is
      // ambiguous and PostgREST answers 300/PGRST201. Written whitespace-free
      // for the reason documented on TICKET_SELECT in lib/tickets/queries.
      .select(
        [
          "*",
          "profile:profiles!project_members_user_id_fkey(id,full_name,email,avatar_url)",
          "adder:profiles!project_members_added_by_fkey(id,full_name,email,avatar_url)",
        ].join(","),
      )
      .eq("project_id", projectId)
      .order("role", { ascending: false });

    if (error) {
      // Returning [] silently renders as "0 people · No members yet", which is
      // indistinguishable from a project that genuinely has no members — and is
      // exactly how a PGRST201 ambiguity hid in production for a whole release.
      // The empty list stays (a members table is not worth an error boundary),
      // but the cause now reaches the server logs.
      console.error(
        `[projects] Could not load members for project ${projectId}: ` +
          `${error.code ?? "?"} ${error.message}. ` +
          "PGRST201 here means an embed onto profiles is missing its FK hint — " +
          "project_members has two foreign keys to that table.",
      );
      return [];
    }

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
