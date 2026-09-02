"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { TextField } from "@/components/forms/text-field";
import { updateTicketDetails } from "@/app/(app)/tickets/actions";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import {
  updateTicketDetailsSchema,
  type UpdateTicketDetailsInput,
  type UpdateTicketDetailsValues,
} from "@/lib/validations/ticket";
import type { TicketWithRelations } from "@/types/app";

/**
 * Edit a ticket's title and description.
 *
 * Only the wording is editable here. Status, priority, category and assignment
 * are separate controls with their own permission rules, and mixing them into
 * one form would imply a requester can change things the database will refuse.
 */
export function EditTicketDialog({
  ticket,
  compact = false,
}: {
  ticket: TicketWithRelations;
  /** Icon-only trigger, for the dense board cards. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const form = useForm<UpdateTicketDetailsInput, unknown, UpdateTicketDetailsValues>({
    resolver: zodResolver(updateTicketDetailsSchema),
    defaultValues: {
      ticketId: ticket.id,
      title: ticket.title,
      description: ticket.description ?? "",
    },
  });

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(values: UpdateTicketDetailsValues) {
    const result = await updateTicketDetails(values);

    if (!result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
      return;
    }

    setOpen(false);
    toast.success("Ticket updated.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Discard unsaved edits when the dialog is dismissed, so reopening
        // shows what is actually stored rather than a stale draft.
        if (!next) {
          reset({
            ticketId: ticket.id,
            title: ticket.title,
            description: ticket.description ?? "",
          });
        }
      }}
    >
      {/* DialogTrigger rather than a bare button: Radix then returns focus here
          when the dialog closes. */}
      <DialogTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            aria-label={`Edit ${ticket.ticket_number}`}
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Pencil aria-hidden />
            Edit
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit {ticket.ticket_number}</DialogTitle>
          <DialogDescription>
            Update the title and description. Everything else is managed from the
            controls on the ticket.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <TextField control={control} name="title" label="Title" autoFocus />

            <Controller
              control={control}
              name="description"
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="edit-description">Description</FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    id="edit-description"
                    className="min-h-72"
                    aria-invalid={Boolean(fieldState.error)}
                  />
                  <FieldDescription>
                    Line breaks are preserved.
                  </FieldDescription>
                  <FieldError
                    errors={fieldState.error ? [fieldState.error] : undefined}
                  />
                </Field>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
