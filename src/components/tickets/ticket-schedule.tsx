"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CalendarDays, Loader2 } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field";
import { updateTicketSchedule } from "@/app/(app)/tickets/actions";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import {
  updateTicketScheduleSchema,
  type UpdateTicketScheduleInput,
  type UpdateTicketScheduleValues,
} from "@/lib/validations/ticket";
import type { TicketWithRelations } from "@/types/app";

/**
 * Planned start and end dates.
 *
 * Unlike the neighbouring selects these do not save on change: a date input
 * emits intermediate values while the user types, so a change handler would
 * fire writes for half-entered dates. An explicit Save, enabled only when
 * something actually changed, avoids that.
 *
 * Staff only, matching `guard_ticket_change()` — a requester sees the dates but
 * cannot set them, because scheduling is the desk's job.
 */
export function TicketSchedule({
  ticket,
  canEdit,
}: {
  ticket: TicketWithRelations;
  canEdit: boolean;
}) {
  const form = useForm<
    UpdateTicketScheduleInput,
    unknown,
    UpdateTicketScheduleValues
  >({
    resolver: zodResolver(updateTicketScheduleSchema),
    defaultValues: {
      ticketId: ticket.id,
      // `date` columns come back as YYYY-MM-DD, which is exactly what a native
      // date input expects — no parsing or timezone conversion needed.
      startDate: ticket.start_date ?? "",
      endDate: ticket.end_date ?? "",
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { isSubmitting, isDirty, errors },
  } = form;

  async function onSubmit(values: UpdateTicketScheduleValues) {
    const result = await updateTicketSchedule(values);

    if (!result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
      return;
    }

    // Re-baseline so the form is clean and Save disables again.
    reset({
      ticketId: ticket.id,
      startDate: values.startDate ?? "",
      endDate: values.endDate ?? "",
    });
    toast.success("Schedule updated.");
  }

  if (!canEdit) {
    const range =
      ticket.start_date || ticket.end_date
        ? [ticket.start_date, ticket.end_date]
            .map((d) => (d ? format(new Date(d), "d MMM yyyy") : "—"))
            .join(" → ")
        : null;

    return (
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Schedule
        </Label>
        <p className="text-sm">
          {range ?? (
            <span className="text-muted-foreground">Not scheduled</span>
          )}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2" noValidate>
      <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <CalendarDays className="size-3.5" aria-hidden />
        Schedule
      </Label>

      {/* Side by side: a date range reads as one thing, and stacking them cost
          about 60px of a already-tall control rail. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label
            htmlFor="ticket-start-date"
            className="text-xs font-normal text-muted-foreground"
          >
            Start
          </Label>
          <Input
            id="ticket-start-date"
            type="date"
            className="px-2"
            {...register("startDate")}
            aria-invalid={Boolean(errors.startDate)}
          />
        </div>

        <div className="space-y-1">
          <Label
            htmlFor="ticket-end-date"
            className="text-xs font-normal text-muted-foreground"
          >
            End
          </Label>
          <Input
            id="ticket-end-date"
            type="date"
            className="px-2"
            {...register("endDate")}
            aria-invalid={Boolean(errors.endDate)}
          />
        </div>
      </div>

      {/* One error slot under the pair — the range error belongs to both. */}
      <FieldError
        errors={
          errors.endDate ?? errors.startDate
            ? [errors.endDate ?? errors.startDate]
            : undefined
        }
      />

      {isDirty ? (
        <div className="flex gap-2 pt-1">
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Save dates"
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSubmitting}
            onClick={() =>
              reset({
                ticketId: ticket.id,
                startDate: ticket.start_date ?? "",
                endDate: ticket.end_date ?? "",
              })
            }
          >
            Reset
          </Button>
        </div>
      ) : null}
    </form>
  );
}
