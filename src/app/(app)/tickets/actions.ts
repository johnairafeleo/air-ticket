"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/actions/result";
import {
  assignTicketSchema,
  createTicketSchema,
  updateTicketCategorySchema,
  updateTicketDetailsSchema,
  updateTicketPrioritySchema,
  updateTicketScheduleSchema,
  updateTicketStatusSchema,
} from "@/lib/validations/ticket";

/**
 * Ticket mutations.
 *
 * These re-validate input and produce readable errors, but the real rules live
 * in the database: `guard_ticket_insert()` forces a new ticket to start clean,
 * and `guard_ticket_change()` enforces per-role column permissions and valid
 * status transitions. So a caller who bypasses these actions entirely still
 * cannot escalate — they just get a less friendly message.
 */

/**
 * Refresh every view a ticket appears in.
 *
 * `revalidatePath("/tickets")` matches that exact path only — it does NOT cover
 * `/tickets/board`, which is a separate route with its own data. Missing it
 * meant the board kept serving stale server data after a mutation.
 */
function revalidateTicket(ticketId: string) {
  revalidatePath("/tickets");
  revalidatePath("/tickets/board");
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/dashboard");
}

/** Turn a Postgres exception from the guard triggers into something readable. */
function describeTicketError(message: string): string {
  if (message.includes("Cannot change ticket status")) {
    return "That status change isn't allowed from the ticket's current state.";
  }
  // Assignment is a row in ticket_assignees now, so a refused one surfaces as
  // an RLS violation rather than a trigger message. Two distinct causes share
  // that one Postgres error, and the policy cannot tell us which, so name both.
  if (message.includes("ticket_assignees")) {
    return (
      "You can only assign yourself to a ticket, and only project staff can be " +
      "assigned. Ask a project manager to assign someone else."
    );
  }
  if (message.includes("must belong to a project")) {
    return "Choose a project for this ticket.";
  }
  if (message.includes("tickets_date_range")) {
    return "The end date cannot be before the start date.";
  }
  if (message.includes("Only support staff can change")) {
    return "Only support staff can change priority, category, assignment or scheduling.";
  }
  if (message.includes("only close a ticket that has been resolved")) {
    return "You can only close a ticket once it has been resolved.";
  }
  if (message.includes("only be edited while it is still open")) {
    return "This ticket can no longer be edited — work has already started.";
  }
  if (message.includes("only change your own tickets")) {
    return "You can only change your own tickets.";
  }
  return "Could not apply that change. Please try again.";
}

/**
 * Create a ticket.
 *
 * Returns the new id rather than redirecting, so the caller decides what
 * happens next: the full page navigates to the ticket, while the modal simply
 * closes and lets revalidation surface it in place.
 */
export async function createTicket(
  input: unknown,
): Promise<ActionResult<{ id: string; ticketNumber: string }>> {
  const { profile } = await requireUser();

  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the errors below.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .insert({
      project_id: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      category_id: parsed.data.categoryId,
      priority: parsed.data.priority,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      status: parsed.data.status,
      // ticket_number is deliberately absent: guard_ticket_insert() derives it
      // from the project key and that project's own counter.
      // The insert guard overwrites this with auth.uid() anyway; sending it
      // keeps the NOT NULL column satisfied and the intent explicit.
      created_by: profile.id,
    })
    .select("id, ticket_number")
    .single();

  if (error || !data) {
    return fail(
      error ? describeTicketError(error.message) : "Could not create the ticket.",
    );
  }

  revalidateTicket(data.id);
  return ok({ id: data.id, ticketNumber: data.ticket_number });
}

export async function updateTicketStatus(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = updateTicketStatusSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.ticketId);

  if (error) return fail(describeTicketError(error.message));

  revalidateTicket(parsed.data.ticketId);
  return ok();
}

export async function updateTicketPriority(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = updateTicketPrioritySchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({ priority: parsed.data.priority })
    .eq("id", parsed.data.ticketId);

  if (error) return fail(describeTicketError(error.message));

  revalidateTicket(parsed.data.ticketId);
  return ok();
}

export async function updateTicketCategory(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = updateTicketCategorySchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({ category_id: parsed.data.categoryId })
    .eq("id", parsed.data.ticketId);

  if (error) return fail(describeTicketError(error.message));

  revalidateTicket(parsed.data.ticketId);
  return ok();
}

/**
 * Set exactly who a ticket is assigned to.
 *
 * Takes the whole set and works out the difference, because assignment lives in
 * a junction table now: rows to add, rows to remove, and everything already
 * correct left alone. Untouched rows keep their original assigned_at and
 * assigned_by, which a delete-then-reinsert would quietly destroy.
 *
 * Authorization is the database's, not this function's. ticket_assignees_insert
 * and ticket_assignees_delete decide it: an agent may only add or remove
 * themselves, a manager may act on anyone who works the project. Note the
 * asymmetry that follows — a rejected INSERT raises, but a DELETE the policy
 * rejects simply matches no rows and reports success, so the removal count is
 * checked rather than assumed.
 */
export async function assignTicket(input: unknown): Promise<ActionResult> {
  const { profile } = await requireUser();

  const parsed = assignTicketSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "Invalid request.",
    );
  }

  const { ticketId, assigneeIds } = parsed.data;
  const supabase = await createClient();

  const { data: current, error: readError } = await supabase
    .from("ticket_assignees")
    .select("user_id")
    .eq("ticket_id", ticketId);

  if (readError) return fail("Could not load the current assignees.");

  const before = new Set((current ?? []).map((row) => row.user_id));
  const after = new Set(assigneeIds);

  const toAdd = assigneeIds.filter((id) => !before.has(id));
  const toRemove = [...before].filter((id) => !after.has(id));

  if (toAdd.length === 0 && toRemove.length === 0) return ok();

  if (toRemove.length > 0) {
    const { error, count } = await supabase
      .from("ticket_assignees")
      .delete({ count: "exact" })
      .eq("ticket_id", ticketId)
      .in("user_id", toRemove);

    if (error) return fail(describeTicketError(error.message));

    if ((count ?? 0) < toRemove.length) {
      return fail(
        "You can only remove yourself from a ticket. Ask a project manager to " +
          "unassign someone else.",
      );
    }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from("ticket_assignees").insert(
      toAdd.map((userId) => ({
        ticket_id: ticketId,
        user_id: userId,
        assigned_by: profile.id,
      })),
    );

    if (error) return fail(describeTicketError(error.message));
  }

  revalidateTicket(ticketId);
  return ok();
}

/** Set or clear a ticket's planned start and end dates. Staff only. */
export async function updateTicketSchedule(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = updateTicketScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the errors below.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
    })
    .eq("id", parsed.data.ticketId);

  if (error) return fail(describeTicketError(error.message));

  revalidateTicket(parsed.data.ticketId);
  return ok();
}

export async function updateTicketDetails(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = updateTicketDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the errors below.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
    })
    .eq("id", parsed.data.ticketId);

  if (error) return fail(describeTicketError(error.message));

  revalidateTicket(parsed.data.ticketId);
  return ok();
}
