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

export type TicketListResult = {
  tickets: TicketWithRelations[];
  total: number;
  page: number;
  pageCount: number;
};

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
    .select(
      filters.scope === "assigned"
        ? `${TICKET_SELECT}${ASSIGNED_TO_ME_JOIN}`
        : TICKET_SELECT,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + TICKETS_PER_PAGE - 1);

  // Status and priority are lists so a filter can express "high or urgent" and
  // "not closed" — the combinations the dashboard cards count.
  if (projectId) query = query.eq("project_id", projectId);
  if (filters.status.length > 0) query = query.in("status", filters.status);
  if (filters.priority.length > 0) query = query.in("priority", filters.priority);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);

  switch (filters.scope) {
    case "mine":
      query = query.eq("created_by", actor.id);
      break;
    case "assigned":
      // Filters through the aliased inner join, so the assignees embed still
      // comes back with everyone on the ticket, not just the caller.
      query = query.eq("mine.user_id", actor.id);
      break;
    case "unassigned":
      // The denormalised count, rather than a NOT EXISTS PostgREST cannot
      // express alongside the other filters and pagination. A trigger keeps it
      // true, and guard_ticket_change() recomputes it so it cannot be spoofed.
      query = query.eq("assignee_count", 0);
      break;
    default:
      break;
  }

  if (filters.q) {
    // Escape PostgREST's or() delimiters so a comma or paren in the search box
    // cannot alter the filter expression.
    const term = filters.q.replace(/[,()]/g, " ").trim();
    if (term) {
      query = query.or(
        `title.ilike.%${term}%,description.ilike.%${term}%,ticket_number.ilike.%${term}%`,
      );
    }
  }

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
  projectId?: string | null,
): Promise<BoardData> {
  const supabase = await createClient();

  const columns = await Promise.all(
    BOARD_COLUMNS.map(async (status) => {
      let query = supabase
        .from("tickets")
        .select(TICKET_SELECT, { count: "exact" })
        .eq("status", status);

      if (projectId) query = query.eq("project_id", projectId);

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
