import "server-only";

import { createClient } from "@/lib/supabase/server";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/types/app";
import type { TicketPriority, TicketStatus } from "@/types/app";

/**
 * Dashboard aggregates.
 *
 * All of it comes from the single `dashboard_stats()` RPC. That function is
 * SECURITY INVOKER, so RLS scopes the numbers to the caller automatically —
 * there is deliberately no role branching here. A USER's "total" is their own
 * tickets; an admin's is everything.
 */

export type CategoryCount = { name: string; count: number };

export type WorkloadEntry = {
  id: string;
  full_name: string | null;
  email: string;
  count: number;
};

export type DashboardStats = {
  total: number;
  /** Not closed and not resolved — i.e. still needing attention. */
  open_like: number;
  unassigned: number;
  assigned_to_me: number;
  created_by_me: number;
  /** HIGH or URGENT and not closed. */
  urgent: number;
  by_status: Record<TicketStatus, number>;
  by_priority: Record<TicketPriority, number>;
  by_category: CategoryCount[];
  workload: WorkloadEntry[];
};

const EMPTY: DashboardStats = {
  total: 0,
  open_like: 0,
  unassigned: 0,
  assigned_to_me: 0,
  created_by_me: 0,
  urgent: 0,
  by_status: Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as Record<
    TicketStatus,
    number
  >,
  by_priority: Object.fromEntries(TICKET_PRIORITIES.map((p) => [p, 0])) as Record<
    TicketPriority,
    number
  >,
  by_category: [],
  workload: [],
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_stats");

  // A dashboard is not worth an error boundary — zeroes read as "nothing yet",
  // which is the same thing a brand-new account would legitimately see.
  if (error || !data) return EMPTY;

  // The RPC returns jsonb, which arrives untyped. Merge onto EMPTY so a missing
  // key can never render as `undefined`.
  return { ...EMPTY, ...(data as unknown as Partial<DashboardStats>) };
}
