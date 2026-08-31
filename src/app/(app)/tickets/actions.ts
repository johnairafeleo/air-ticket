"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/actions/result";
import {
  assignTicketSchema,
  createTicketSchema,
  updateTicketCategorySchema,
  updateTicketDetailsSchema,
  updateTicketPrioritySchema,
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

/** Turn a Postgres exception from the guard triggers into something readable. */
function describeTicketError(message: string): string {
  if (message.includes("Cannot change ticket status")) {
    return "That status change isn't allowed from the ticket's current state.";
  }
  if (message.includes("assigned to another agent")) {
    return "This ticket is assigned to another agent.";
  }
  if (message.includes("Only an administrator can assign")) {
    return "Only an administrator can assign a ticket to someone else.";
  }
  if (message.includes("Only support staff can change")) {
    return "Only support staff can change priority, category or assignment.";
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

export async function createTicket(input: unknown): Promise<ActionResult> {
  const { profile } = await requireUser();

  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the errors below.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      category_id: parsed.data.categoryId,
      priority: parsed.data.priority,
      // The insert guard overwrites this with auth.uid() anyway; sending it
      // keeps the NOT NULL column satisfied and the intent explicit.
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return fail(
      error ? describeTicketError(error.message) : "Could not create the ticket.",
    );
  }

  revalidatePath("/tickets");
  redirect(`/tickets/${data.id}`);
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

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/tickets");
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

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/tickets");
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

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  return ok();
}

/**
 * Assign, reassign, claim or release a ticket.
 *
 * An agent may only claim or release; the trigger rejects an agent handing work
 * to a third party.
 */
export async function assignTicket(input: unknown): Promise<ActionResult> {
  await requireUser();

  const parsed = assignTicketSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("tickets")
    .update({ assigned_to: parsed.data.assigneeId })
    .eq("id", parsed.data.ticketId);

  if (error) return fail(describeTicketError(error.message));

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/tickets");
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

  revalidatePath(`/tickets/${parsed.data.ticketId}`);
  revalidatePath("/tickets");
  return ok();
}
