import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { BOARD_COLUMNS } from "@/lib/tickets/constants";
import type {
  Category,
  Profile,
  TicketStatus,
  TicketWithRelations,
} from "@/types/app";
import type { TicketFilters } from "@/lib/validations/ticket";

/**
 * Ticket reads.
 *
 * Every query here runs under the caller's RLS context, so scoping is enforced
 * by Postgres, not by the filters below. The `scope` filter is a convenience
 * for narrowing what the user can already see — it can never widen it. A USER
 * asking for `scope=all` still only gets their own tickets.
 */

export const TICKETS_PER_PAGE = 20;

/**
 * SOFT_DELETE — every read in this file filters `deleted_at is null`.
 *
 * Since 0020 deleting a ticket sets `deleted_at` rather than removing the row,
 * and the database does NOT hide those rows for you: `tickets_select` is
 * deliberately unchanged so a "deleted tickets" view stays possible without
 * another policy change. The consequence is that this filter is the only thing
 * keeping deleted tickets out of the UI.
 *
 * So: any new query against `tickets` needs `.is("deleted_at", null)`. There
 * are three reads here and the `visible` CTE inside `dashboard_stats()`; those
 * four are the complete set, and they must stay in agreement or one screen will
 * count a ticket another screen says is gone.
 */

/**
 * The joined shape every list and detail view renders.
 *
 * Written as parts joined with commas, NOT as a pretty multi-line template.
 * PostgREST's select parser is whitespace-sensitive in ways that fail in two
 * different registers, and the quiet one is the dangerous one:
 *
 *   * a newline before a comma, or a space after `!inner`, is a hard 400;
 *   * but a newline inside the `...profiles!fk ( … )` spread returned HTTP 200
 *     with `assignees: []` on a ticket that definitely had an assignee —
 *     silently dropping the data rather than complaining.
 *
 * Keeping every fragment whitespace-free removes the whole class of problem,
 * and the array keeps it readable.
 */
const TICKET_SELECT = [
  "*",
  "project:projects(id,key,name)",
  "category:categories(id,name)",
  "creator:profiles!tickets_created_by_fkey(id,full_name,email,avatar_url)",
  // The FK hint is required: ticket_assignees has two foreign keys to profiles
  // (user_id and assigned_by), so a bare `profiles` embed is ambiguous and
  // PostgREST answers 300/PGRST201. The `...` spread flattens the joined row
  // into the array elements, giving TicketAssignee[] with no mapping pass.
  "assignees:ticket_assignees(...profiles!ticket_assignees_user_id_fkey(id,full_name,email,avatar_url))",
].join(",");

/**
 * Extra embed used ONLY to filter the "assigned to me" scope.
 *
 * The obvious approach — putting !inner on the assignees embed above and
 * filtering it — also filters what that embed returns, so a ticket shared by
 * three people would render as if only you were on it. A second, separately
 * aliased inner join filters the parent rows while leaving the display embed
 * whole.
 *
 * `!inner` must be followed immediately by `(` — a space there is a 400.
 */
const ASSIGNED_TO_ME_JOIN = `,mine:ticket_assignees!inner(user_id)` as const;

/**
 * The same trick again, for the "assigned to <person>" filter.
 *
 * A SECOND alias rather than reusing `mine`: the two filters are independent,
 * and "assigned to me" plus "assigned to Ada" on one join would be two
 * contradictory equalities on the same column, matching nothing. Separate
 * aliases make it an intersection — tickets you are both on — which is what
 * choosing both filters should mean.
 */
const ASSIGNEE_FILTER_JOIN = `,assignee_filter:ticket_assignees!inner(user_id)` as const;

export type TicketListResult = {
  tickets: TicketWithRelations[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * The select string for a given set of filters.
 *
 * Each join is added ONLY when its filter is active. An unused `!inner` would
 * still restrict the result to tickets that have at least one assignee, which
 * would quietly hide every unassigned ticket.
 */
function selectFor(filters: TicketFilters): string {
  return (
    TICKET_SELECT +
    (filters.scope === "assigned" ? ASSIGNED_TO_ME_JOIN : "") +
    (filters.assigneeId ? ASSIGNEE_FILTER_JOIN : "")
  );
}

/**
 * Everything except status, pagination and ordering.
 *
 * Shared by the list and the board so the same URL means the same thing in
 * both. Status is excluded because the board's columns ARE the statuses — it
 * fixes its own per column — and the list applies it separately.
 *
 * Structurally typed rather than importing PostgREST's builder types: every
 * method here returns the same builder, so the generic threads through without
 * depending on the shape of a transitive dependency.
 */
function applyTicketFilters<
  Q extends {
    eq(column: string, value: string | number): Q;
    in(column: string, values: readonly string[]): Q;
    or(filter: string): Q;
  },
>(
  query: Q,
  actor: Profile,
  filters: TicketFilters,
  projectId?: string | null,
): Q {
  let q = query;

  if (projectId) q = q.eq("project_id", projectId);
  if (filters.priority.length > 0) q = q.in("priority", filters.priority);
  if (filters.categoryId) q = q.eq("category_id", filters.categoryId);

  // Filter by person. Both narrow within what RLS already permits.
  if (filters.createdBy) q = q.eq("created_by", filters.createdBy);
  if (filters.assigneeId) q = q.eq("assignee_filter.user_id", filters.assigneeId);

  switch (filters.scope) {
    case "mine":
      q = q.eq("created_by", actor.id);
      break;
    case "assigned":
      // Filters through the aliased inner join, so the assignees embed still
      // comes back with everyone on the ticket, not just the caller.
      q = q.eq("mine.user_id", actor.id);
      break;
    case "unassigned":
      // The denormalised count, rather than a NOT EXISTS PostgREST cannot
      // express alongside the other filters and pagination. A trigger keeps it
      // true, and guard_ticket_change() recomputes it so it cannot be spoofed.
      q = q.eq("assignee_count", 0);
      break;
    default:
      break;
  }

  if (filters.q) {
    // Escape PostgREST's or() delimiters so a comma or paren in the search box
    // cannot alter the filter expression.
    const term = filters.q.replace(/[,()]/g, " ").trim();
    if (term) {
      q = q.or(
        `title.ilike.%${term}%,description.ilike.%${term}%,ticket_number.ilike.%${term}%`,
      );
    }
  }

  return q;
}

export async function listTickets(
  actor: Profile,
  filters: TicketFilters,
  /** Scope to one project. Null only when no project exists yet. */
  projectId?: string | null,
): Promise<TicketListResult> {
  const supabase = await createClient();
  const from = (filters.page - 1) * TICKETS_PER_PAGE;

  let query = supabase
    .from("tickets")
    .select(selectFor(filters), { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + TICKETS_PER_PAGE - 1)
    // Soft-deleted tickets are hidden from every read. See SOFT_DELETE above.
    .is("deleted_at", null);

  query = applyTicketFilters(query, actor, filters, projectId);

  // Status is a list so a filter can express "high or urgent" and "not closed"
  // — the combinations the dashboard cards count. Applied here rather than in
  // the shared helper because the board fixes its own status per column.
  if (filters.status.length > 0) query = query.in("status", filters.status);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to load tickets: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    tickets: (data ?? []) as unknown as TicketWithRelations[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / TICKETS_PER_PAGE)),
  };
}

/** A single ticket, or null when it does not exist or RLS hides it. */
export async function getTicket(id: string): Promise<TicketWithRelations | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;

  return data as unknown as TicketWithRelations;
}

/** Cards fetched per board column. */
export const BOARD_COLUMN_LIMIT = 50;

export type BoardColumnData = {
  tickets: TicketWithRelations[];
  /** Total matching this status, so a truncated column can say how many remain. */
  total: number;
};

export type BoardData = Record<TicketStatus, BoardColumnData>;

/**
 * Tickets grouped by status for the Kanban board.
 *
 * Each column is queried separately and capped: CLOSED grows without bound, and
 * a single unbounded fetch would eventually make the board unusable. The count
 * is exact so a truncated column can link the remainder into the table view.
 *
 * Runs under RLS like every other read. Since 0009 that scoping is by project
 * membership, not by assignment: staff see the whole project's board, while a
 * MEMBER sees only the tickets they raised.
 */
export async function listBoardTickets(
  actor: Profile,
  filters: TicketFilters,
  projectId?: string | null,
): Promise<BoardData> {
  const supabase = await createClient();

  const columns = await Promise.all(
    BOARD_COLUMNS.map(async (status) => {
      let query = supabase
        .from("tickets")
        .select(selectFor(filters), { count: "exact" })
        // The column IS the status filter here, which is why the shared helper
        // deliberately leaves status alone.
        .eq("status", status)
        .is("deleted_at", null);

      query = applyTicketFilters(query, actor, filters, projectId);

      const { data, error, count } = await query
        // Most urgent first, then most recently touched — the order an agent
        // would want to work the column in.
        .order("priority", { ascending: false })
        .order("updated_at", { ascending: false })
        .range(0, BOARD_COLUMN_LIMIT - 1);

      if (error) {
        throw new Error(`Failed to load ${status} tickets: ${error.message}`);
      }

      return [
        status,
        {
          tickets: (data ?? []) as unknown as TicketWithRelations[],
          total: count ?? 0,
        },
      ] as const;
    }),
  );

  return Object.fromEntries(columns) as BoardData;
}

/** Active categories for pickers. Memoized per render pass. */
export const listCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) return [];
  return data ?? [];
});

/**
 * Staff who can be assigned work.
 *
 * Only admins can assign to someone else, and RLS lets agents and admins read
 * all profiles, so this returns nothing useful to a plain USER by design.
 */
export const listAssignableAgents = cache(async (): Promise<Profile[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["AGENT", "ADMIN"])
    .eq("is_active", true)
    .order("full_name");

  if (error) return [];
  return data ?? [];
});

/** A person who can appear in a ticket's creator or assignee slot. */
export type TicketPerson = Pick<
  Profile,
  "id" | "full_name" | "email" | "avatar_url"
>;

/**
 * Everyone who actually appears on this project's tickets.
 *
 * The person filters were originally fed from `project_members`, which is the
 * wrong set: someone removed from the project, or assigned before they left,
 * still shows in the "Assigned to" column but was missing from the dropdown —
 * so the list offered names you could not see and hid names you could.
 *
 * Deduplicated in TypeScript rather than with a DISTINCT in SQL, which would
 * need an RPC and therefore a migration. The cost is one row per ticket and one
 * per assignment, which is nothing at this size; if a project ever reaches tens
 * of thousands of tickets, this is the query to turn into a view.
 *
 * Runs under RLS like every other read, so it can only name people on tickets
 * the caller may already see.
 */
export const listTicketPeople = cache(
  async (
    projectId: string,
  ): Promise<{ creators: TicketPerson[]; assignees: TicketPerson[] }> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("tickets")
      .select(
        [
          "creator:profiles!tickets_created_by_fkey(id,full_name,email,avatar_url)",
          "assignees:ticket_assignees(...profiles!ticket_assignees_user_id_fkey(id,full_name,email,avatar_url))",
        ].join(","),
      )
      .eq("project_id", projectId)
      .is("deleted_at", null);

    if (error) return { creators: [], assignees: [] };

    const creators = new Map<string, TicketPerson>();
    const assignees = new Map<string, TicketPerson>();

    for (const row of (data ?? []) as unknown as {
      creator: TicketPerson | null;
      assignees: TicketPerson[];
    }[]) {
      if (row.creator) creators.set(row.creator.id, row.creator);
      for (const person of row.assignees ?? []) assignees.set(person.id, person);
    }

    return { creators: [...creators.values()], assignees: [...assignees.values()] };
  },
);
