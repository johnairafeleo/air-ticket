"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { formatDistanceToNow } from "date-fns";
import { GripVertical } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PriorityBadge } from "@/components/tickets/ticket-badges";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/users";
import type { TicketWithRelations } from "@/types/app";

/**
 * A single board card.
 *
 * `draggable` is decided by the parent from `availableStatuses()`, which mirrors
 * the database guards. A card the actor cannot legally move renders without a
 * drag handle at all rather than looking interactive and then failing.
 */
export function TicketCard({
  ticket,
  draggable,
  isDragging = false,
  overlay = false,
}: {
  ticket: TicketWithRelations;
  draggable: boolean;
  isDragging?: boolean;
  /** True when rendered inside the DragOverlay, which must not be draggable itself. */
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: ticket.id,
    disabled: !draggable || overlay,
    data: { status: ticket.status },
  });

  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm transition-opacity",
        // The original stays in place but faded while its overlay copy follows
        // the cursor — moving the real node would collapse the column layout.
        isDragging && "opacity-40",
        overlay && "cursor-grabbing shadow-lg ring-2 ring-ring",
      )}
    >
      <div className="flex items-start gap-2">
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

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {ticket.ticket_number}
            </span>
            <PriorityBadge priority={ticket.priority} className="text-[10px]" />
          </div>

          {/* A link inside a draggable needs its own node so the pointer
              listeners on the handle don't swallow the click. */}
          <Link
            href={`/tickets/${ticket.id}`}
            className="block text-sm font-medium leading-snug underline-offset-4 hover:underline"
          >
            {ticket.title}
          </Link>

          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {ticket.category?.name ?? "Uncategorised"}
            </span>

            {ticket.assignee ? (
              <Avatar className="size-5" title={ticket.assignee.full_name ?? ticket.assignee.email}>
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

          <p className="text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}
          </p>
        </div>
      </div>
    </article>
  );
}
