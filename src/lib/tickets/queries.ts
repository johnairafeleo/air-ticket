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

/** The joined shape every list and detail view renders. */
const TICKET_SELECT = `
  *,
  category:categories ( id, name ),
  creator:profiles!tickets_created_by_fkey ( id, full_name, email, avatar_url ),
  assignee:profiles!tickets_assigned_to_fkey ( id, full_name, email, avatar_url )
` as const;

export type TicketListResult = {
  tickets: TicketWithRelations[];
  total: number;
  page: number;
  pageCount: number;
};

export async function listTickets(
  actor: Profile,
  filters: TicketFilters,
): Promise<TicketListResult> {
  const supabase = await createClient();
  const from = (filters.page - 1) * TICKETS_PER_PAGE;

  let query = supabase
    .from("tickets")
    .select(TICKET_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + TICKETS_PER_PAGE - 1);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);

  switch (filters.scope) {
    case "mine":
      query = query.eq("created_by", actor.id);
      break;
    case "assigned":
      query = query.eq("assigned_to", actor.id);
      break;
    case "unassigned":
      query = query.is("assigned_to", null);
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
 * Runs under RLS like every other read, so an agent's board can only ever
 * contain tickets assigned to them or sitting unassigned.
 */
export async function listBoardTickets(): Promise<BoardData> {
  const supabase = await createClient();

  const columns = await Promise.all(
    BOARD_COLUMNS.map(async (status) => {
      const { data, error, count } = await supabase
        .from("tickets")
        .select(TICKET_SELECT, { count: "exact" })
        .eq("status", status)
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
