"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ExternalLink, Loader2, Pencil } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { TextField } from "@/components/forms/text-field";
import { PriorityBadge, StatusBadge } from "@/components/tickets/ticket-badges";
import { TicketControls } from "@/components/tickets/ticket-controls";
import { updateTicketDetails } from "@/app/(app)/tickets/actions";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import {
  updateTicketDetailsSchema,
  type UpdateTicketDetailsInput,
  type UpdateTicketDetailsValues,
} from "@/lib/validations/ticket";
import { initialsOf, displayName } from "@/lib/users";
import type {
  Category,
  ProjectMemberWithProfile,
  TicketActor,
  TicketWithRelations,
} from "@/types/app";

/**
 * Full ticket in a modal, opened from a board card.
 *
 * Everything renders from data the board already fetched, so opening a card
 * costs no round trip. Editing happens inline rather than in a second dialog —
 * nesting modals to change a title is worse than swapping the same surface into
 * a form.
 */
export function TicketDetailDialog({
  ticket,
  actor,
  agents,
  categories,
  canEdit,
  open,
  onOpenChange,
}: {
  ticket: TicketWithRelations;
  actor: TicketActor;
  agents: ProjectMemberWithProfile[];
  categories: Category[];
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);

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

  function resetForm() {
    reset({
      ticketId: ticket.id,
      title: ticket.title,
      description: ticket.description ?? "",
    });
  }

  async function onSubmit(values: UpdateTicketDetailsValues) {
    const result = await updateTicketDetails(values);

    if (!result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
      return;
    }

    setEditing(false);
    toast.success("Ticket updated.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // Leaving the dialog abandons any unsaved edit, so the next open shows
        // what is actually stored.
        if (!next) {
          setEditing(false);
          resetForm();
        }
      }}
    >
      <DialogContent className="max-h-[92svh] gap-0 overflow-y-auto sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {ticket.ticket_number}
            </span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />

            <Button
              variant="ghost"
              size="sm"
              asChild
              className="ml-auto text-muted-foreground"
            >
              <Link href={`/tickets/${ticket.id}`}>
                <ExternalLink aria-hidden />
                Full page
              </Link>
            </Button>
          </div>

          <DialogTitle className="text-left text-lg leading-snug">
            {ticket.title}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 pt-4 md:grid-cols-[minmax(0,1fr)_270px]">
          <div className="flex flex-col gap-3">
            {editing ? (
              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <FieldGroup>
                  <TextField control={control} name="title" label="Title" autoFocus />

                  <Controller
                    control={control}
                    name="description"
                    render={({ field, fieldState }) => (
                      <Field data-invalid={Boolean(fieldState.error)}>
                        <FieldLabel htmlFor="quick-description">
                          Description
                        </FieldLabel>
                        <Textarea
                          {...field}
                          value={field.value ?? ""}
                          id="quick-description"
                          // The shadcn Textarea sets field-sizing-content and
                          // min-h-16, which override the rows attribute — the
                          // floor has to be a class.
                          className="min-h-56"
                          aria-invalid={Boolean(fieldState.error)}
                        />
                        <FieldError
                          errors={fieldState.error ? [fieldState.error] : undefined}
                        />
                      </Field>
                    )}
                  />

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => {
                        setEditing(false);
                        resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden />
                          Saving…
                        </>
                      ) : (
                        "Save changes"
                      )}
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 border-b pb-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Description
                  </h3>
                  {canEdit ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(true)}
                    >
                      <Pencil aria-hidden />
                      Edit
                    </Button>
                  ) : null}
                </div>

                {/* whitespace-pre-wrap keeps the reporter's line breaks without
                    rendering their text as HTML. */}
                {ticket.description ? (
                  <p className="min-h-24 whitespace-pre-wrap text-sm leading-relaxed">
                    {ticket.description}
                  </p>
                ) : (
                  <p className="min-h-24 text-sm italic text-muted-foreground">
                    No description was given.
                  </p>
                )}
              </>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Avatar className="size-5">
                  {ticket.creator?.avatar_url ? (
                    <AvatarImage src={ticket.creator.avatar_url} alt="" />
                  ) : null}
                  <AvatarFallback className="text-[9px]">
                    {ticket.creator ? initialsOf(ticket.creator) : "?"}
                  </AvatarFallback>
                </Avatar>
                Raised by {displayName(ticket.creator)}
              </span>
              <span>
                Created {format(new Date(ticket.created_at), "d MMM yyyy, HH:mm")}
              </span>
              <span>
                Updated{" "}
                {formatDistanceToNow(new Date(ticket.updated_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>

          <div className="md:border-l md:pl-6">
            <TicketControls
              ticket={ticket}
              actor={actor}
              agents={agents}
              categories={categories}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
