import * as z from "zod";

import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/types/app";

/**
 * Ticket validation schemas, shared by the forms and the Server Actions.
 *
 * Length bounds match the CHECK constraints in 0002_tickets.sql, so a value
 * that passes here cannot be rejected by the database for length.
 */

/**
 * Every "optional" field here must survive being parsed TWICE.
 *
 * The client resolver parses the form values, so `onSubmit` already holds the
 * transformed output; that output is then sent to the Server Action, which
 * re-validates it with this same schema. So a transform whose input type does
 * not include its own output type fails on the second pass — `"" -> null` then
 * `null -> "Invalid input: expected string, received null"`.
 *
 * Accepting null on the way in makes each transform idempotent, which is what
 * the re-validation actually requires.
 */

/** An empty string from a date input means "cleared". */
const optionalDate = z
  .union([z.iso.date(), z.literal(""), z.null()])
  .transform((value) => (value === "" ? null : value));

/**
 * The set of people on a ticket.
 *
 * Shared by create and assign so the two cannot drift: both fold duplicates
 * (a double-click or a stale form could repeat an id, and the junction table's
 * primary key would reject the whole batch) and both cap the list at 20.
 */
const assigneeIds = z
  .array(z.uuid())
  .transform((ids) => [...new Set(ids)])
  .refine((ids) => ids.length <= 20, {
    error: "A ticket cannot have more than 20 assignees.",
  });

export const createTicketSchema = z
  .object({
    // Required: a ticket's number is derived from its project's key, so there
    // is no meaningful "no project" state.
    projectId: z.uuid({ error: "Choose a project." }),
    title: z
      .string()
      .trim()
      .min(3, { error: "Give the ticket a short, descriptive title." })
      .max(200, { error: "Title must be 200 characters or fewer." }),
    description: z
      .string()
      .trim()
      .max(10000, { error: "Description must be 10,000 characters or fewer." })
      // Optional since 0018. An untouched textarea gives "", the re-parse on
      // the server gives null; both mean "no description".
      .nullable()
      .transform((value) => (value === "" || value === null ? null : value)),
    categoryId: z
      .union([z.uuid({ error: "Choose a category." }), z.literal(""), z.null()])
      .transform((value) => (value === "" ? null : value)),
    priority: z.enum(TICKET_PRIORITIES, { error: "Choose a priority." }),
    // Staff-only. guard_ticket_insert() nulls these for USER callers, so the
    // form hiding them is convenience, not enforcement.
    startDate: optionalDate,
    endDate: optionalDate,
    // Which board column to create into. Staff only — the insert guard pins a
    // requester's ticket to OPEN regardless of what is sent.
    status: z.enum(TICKET_STATUSES).optional(),
    // Optional, and empty for anyone who cannot assign. These become rows in
    // ticket_assignees AFTER the ticket exists — guard_ticket_insert() forces
    // assignee_count to 0, so assignment can never ride along on the insert.
    assigneeIds: assigneeIds.optional().default([]),
  })
  .refine(
    (data) =>
      !data.startDate || !data.endDate || data.endDate >= data.startDate,
    { error: "End date cannot be before the start date.", path: ["endDate"] },
  );

export const updateTicketDetailsSchema = z.object({
  ticketId: z.uuid(),
  title: z
    .string()
    .trim()
    .min(3, { error: "Give the ticket a short, descriptive title." })
    .max(200, { error: "Title must be 200 characters or fewer." }),
  description: z
    .string()
    .trim()
    .max(10000, { error: "Description must be 10,000 characters or fewer." })
    // Optional since 0018. An untouched textarea gives "", the re-parse on the
    // server gives null; both mean "no description".
    .nullable()
    .transform((value) => (value === "" || value === null ? null : value)),
});

export const updateTicketStatusSchema = z.object({
  ticketId: z.uuid(),
  status: z.enum(TICKET_STATUSES, { error: "Choose a valid status." }),
});

export const updateTicketPrioritySchema = z.object({
  ticketId: z.uuid(),
  priority: z.enum(TICKET_PRIORITIES, { error: "Choose a valid priority." }),
});

export const updateTicketCategorySchema = z.object({
  ticketId: z.uuid(),
  categoryId: z
    .union([z.uuid(), z.literal("")])
    .transform((value) => (value === "" ? null : value)),
});

export const updateTicketScheduleSchema = z
  .object({
    ticketId: z.uuid(),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  // Mirrors the tickets_date_range CHECK constraint, so the user gets a field
  // error instead of a database exception.
  .refine(
    (data) =>
      !data.startDate || !data.endDate || data.endDate >= data.startDate,
    { error: "End date cannot be before the start date.", path: ["endDate"] },
  );

/**
 * The complete set of people a ticket should be assigned to.
 *
 * Deliberately the whole set rather than an add/remove instruction: the picker
 * shows every assignee at once, so sending what it now reads is both simpler
 * and idempotent. An empty list means "return it to the unassigned queue".
 */
export const assignTicketSchema = z.object({
  ticketId: z.uuid(),
  assigneeIds,
});

/**
 * Comma-separated enum list, e.g. `?status=OPEN,IN_PROGRESS`.
 *
 * Multi-value filters exist because the dashboard counts combinations — "high
 * or urgent", "not closed" — and a single-value filter cannot express them, so
 * a card's number and its link disagreed. An empty result means "no filter".
 * Unknown values are dropped rather than failing the whole parse, so a
 * hand-edited URL degrades instead of silently resetting every filter.
 */
function multiEnum<T extends readonly [string, ...string[]]>(values: T) {
  const allowed = new Set<string>(values);

  return z
    .string()
    .optional()
    .transform((raw) =>
      (raw ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter((v) => allowed.has(v)),
    ) as unknown as z.ZodType<T[number][], unknown>;
}

/** Filters accepted by the ticket list. All optional. */
export const ticketFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: multiEnum(TICKET_STATUSES),
  priority: multiEnum(TICKET_PRIORITIES),
  categoryId: z.uuid().optional(),
  scope: z.enum(["all", "mine", "assigned", "unassigned"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export type CreateTicketInput = z.input<typeof createTicketSchema>;
export type CreateTicketValues = z.output<typeof createTicketSchema>;
// Input and output differ: description is a string in the textarea and null in
// the payload once "" has been transformed away.
export type UpdateTicketDetailsInput = z.input<typeof updateTicketDetailsSchema>;
export type UpdateTicketDetailsValues = z.output<typeof updateTicketDetailsSchema>;
export type UpdateTicketScheduleInput = z.input<typeof updateTicketScheduleSchema>;
export type UpdateTicketScheduleValues = z.output<typeof updateTicketScheduleSchema>;
export type TicketFilters = z.output<typeof ticketFiltersSchema>;
