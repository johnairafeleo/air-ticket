"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { format, formatDistanceToNow } from "date-fns";
import { CalendarDays, GripVertical } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PriorityBadge } from "@/components/tickets/ticket-badges";
import { TicketDetailDialog } from "@/components/tickets/ticket-detail-dialog";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/users";
import type {
  Category,
  ProjectMemberWithProfile,
  TicketActor,
  TicketWithRelations,
} from "@/types/app";

/**
 * A single board card.
 *
 * Clicking the body opens the ticket in a modal rather than navigating — losing
 * the board to a full page and coming back is the main friction on a Kanban
 * view. The modal renders from data the board already has, so opening costs no
 * round trip.
 *
 * `draggable` comes from `availableStatuses()`, which mirrors the database
 * guards: a card the actor cannot legally move has no drag handle at all rather
 * than looking interactive and then failing.
 */
export function TicketCard({
  ticket,
  draggable,
  actor,
  agents,
  categories,
  canEdit = false,
  isDragging = false,
  overlay = false,
}: {
  ticket: TicketWithRelations;
  draggable: boolean;
  actor: TicketActor;
  agents: ProjectMemberWithProfile[];
  categories: Category[];
  canEdit?: boolean;
  isDragging?: boolean;
  /** True when rendered inside the DragOverlay, which is a non-interactive copy. */
  overlay?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const { attributes, listeners, setNodeRef } = useDraggable({
    id: ticket.id,
    disabled: !draggable || overlay,
    data: { status: ticket.status },
  });

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {ticket.ticket_number}
        </span>
        <PriorityBadge priority={ticket.priority} className="text-[10px]" />
      </div>

      <p className="text-left text-sm font-medium leading-snug">{ticket.title}</p>

      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">
          {ticket.category?.name ?? "Uncategorised"}
        </span>

        {ticket.assignee ? (
          <Avatar
            className="size-5"
            title={ticket.assignee.full_name ?? ticket.assignee.email}
          >
            {ticket.assignee.avatar_url ? (
              <AvatarImage src={ticket.assignee.avatar_url} alt="" />
            ) : null}
            <AvatarFallback className="text-[9px]">
              {initialsOf(ticket.assignee)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="text-[10px] text-muted-foreground">Unassigned</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}
        </span>
        {ticket.end_date ? (
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3" aria-hidden />
            {format(new Date(ticket.end_date), "d MMM")}
          </span>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      <article
        ref={overlay ? undefined : setNodeRef}
        className={cn(
          "rounded-lg border bg-card shadow-sm transition-opacity",
          // The original stays in place but faded while the overlay copy follows
          // the cursor — moving the real node would collapse the column layout.
          isDragging && "opacity-40",
          overlay && "cursor-grabbing shadow-lg ring-2 ring-ring",
        )}
      >
        <div className="flex items-start gap-1 p-3">
          {draggable && !overlay ? (
            <button
              type="button"
              className="mt-0.5 -ml-1 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Move ${ticket.ticket_number}`}
              {...listeners}
              {...attributes}
            >
              <GripVertical className="size-4" aria-hidden />
            </button>
          ) : null}

          {overlay ? (
            <div className="min-w-0 flex-1 space-y-2">{body}</div>
          ) : (
            // A real button, so the card is reachable and operable by keyboard.
            // The drag listeners live on the handle only, so clicking here can
            // never start a drag.
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={`Open ${ticket.ticket_number}: ${ticket.title}`}
              className="min-w-0 flex-1 space-y-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {body}
            </button>
          )}
        </div>
      </article>

      {/* Radix only mounts dialog content while open, so this is cheap per card. */}
      {overlay ? null : (
        <TicketDetailDialog
          ticket={ticket}
          actor={actor}
          agents={agents}
          categories={categories}
          canEdit={canEdit}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
