import * as z from "zod";

import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/types/app";

/**
 * Ticket validation schemas, shared by the forms and the Server Actions.
 *
 * Length bounds match the CHECK constraints in 0002_tickets.sql, so a value
 * that passes here cannot be rejected by the database for length.
 */

export const createTicketSchema = z.object({
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
});

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

export const assignTicketSchema = z.object({
  ticketId: z.uuid(),
  // Empty string means "return to the unassigned queue".
  assigneeId: z
    .union([z.uuid(), z.literal("")])
    .transform((value) => (value === "" ? null : value)),
});

/** Filters accepted by the ticket list. All optional. */
export const ticketFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  categoryId: z.uuid().optional(),
  scope: z.enum(["all", "mine", "assigned", "unassigned"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export type CreateTicketInput = z.input<typeof createTicketSchema>;
export type CreateTicketValues = z.output<typeof createTicketSchema>;
export type UpdateTicketDetailsInput = z.infer<typeof updateTicketDetailsSchema>;
export type TicketFilters = z.output<typeof ticketFiltersSchema>;
