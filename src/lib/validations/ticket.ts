import * as z from "zod";

import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/types/app";

/**
 * Ticket validation schemas, shared by the forms and the Server Actions.
 *
 * Length bounds match the CHECK constraints in 0002_tickets.sql, so a value
 * that passes here cannot be rejected by the database for length.
 */

/** An empty string from a date input means "cleared". */
const optionalDate = z
  .union([z.iso.date(), z.literal("")])
  .transform((value) => (value === "" ? null : value));

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
      .min(10, { error: "Describe the problem in at least 10 characters." })
      .max(10000, { error: "Description must be 10,000 characters or fewer." }),
    categoryId: z
      .union([z.uuid({ error: "Choose a category." }), z.literal("")])
      .transform((value) => (value === "" ? null : value)),
    priority: z.enum(TICKET_PRIORITIES, { error: "Choose a priority." }),
    // Staff-only. guard_ticket_insert() nulls these for USER callers, so the
    // form hiding them is convenience, not enforcement.
    startDate: optionalDate,
    endDate: optionalDate,
    // Which board column to create into. Staff only — the insert guard pins a
    // requester's ticket to OPEN regardless of what is sent.
    status: z.enum(TICKET_STATUSES).optional(),
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
    .min(10, { error: "Describe the problem in at least 10 characters." })
    .max(10000, { error: "Description must be 10,000 characters or fewer." }),
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
  assigneeIds: z
    .array(z.uuid())
    // A double-click or a stale form could repeat an id; the junction table's
    // primary key would reject the batch outright, so fold duplicates here.
    .transform((ids) => [...new Set(ids)])
    .refine((ids) => ids.length <= 20, {
      error: "A ticket cannot have more than 20 assignees.",
    }),
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
export type UpdateTicketDetailsInput = z.infer<typeof updateTicketDetailsSchema>;
export type UpdateTicketScheduleInput = z.input<typeof updateTicketScheduleSchema>;
export type UpdateTicketScheduleValues = z.output<typeof updateTicketScheduleSchema>;
export type TicketFilters = z.output<typeof ticketFiltersSchema>;
