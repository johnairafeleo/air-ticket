"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";

import { BoardColumn } from "@/components/tickets/board-column";
import { TicketCard } from "@/components/tickets/ticket-card";
import { updateTicketStatus } from "@/app/(app)/tickets/actions";
import {
  BOARD_COLUMNS,
  STATUS_LABELS,
  availableStatuses,
  canTransition,
} from "@/lib/tickets/constants";
import type { BoardData } from "@/lib/tickets/queries";
import type { Profile, TicketStatus, TicketWithRelations } from "@/types/app";

/**
 * The Kanban board.
 *
 * Local state mirrors the server data so a dropped card moves immediately. The
 * database is still the authority: `updateTicketStatus` goes through the same
 * guards as every other path, and a rejection rolls the card back to where it
 * came from. The UI never wins that argument — it only avoids waiting for it.
 */
export function TicketBoard({
  initial,
  actor,
}: {
  initial: BoardData;
  actor: Profile;
}) {
  const [board, setBoard] = useState<BoardData>(initial);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    // A small distance threshold means a click on the card's link is still a
    // click, not an accidental micro-drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const allTickets = BOARD_COLUMNS.flatMap((s) => board[s].tickets);
  const activeTicket = allTickets.find((t) => t.id === activeId) ?? null;

  function isDraggable(ticket: TicketWithRelations): boolean {
    return (
      availableStatuses(actor, ticket.status, ticket.created_by === actor.id)
        .length > 0
    );
  }

  function move(
    current: BoardData,
    ticket: TicketWithRelations,
    from: TicketStatus,
    to: TicketStatus,
  ): BoardData {
    const moved = { ...ticket, status: to };
    return {
      ...current,
      [from]: {
        tickets: current[from].tickets.filter((t) => t.id !== ticket.id),
        total: current[from].total - 1,
      },
      [to]: {
        tickets: [moved, ...current[to].tickets],
        total: current[to].total + 1,
      },
    };
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);

    const { active, over } = event;
    if (!over) return;

    const ticket = allTickets.find((t) => t.id === String(active.id));
    if (!ticket) return;

    const from = ticket.status;
    const to = over.id as TicketStatus;
    if (from === to || !canTransition(from, to)) return;

    const before = board;
    setBoard((current) => move(current, ticket, from, to));

    const result = await updateTicketStatus({ ticketId: ticket.id, status: to });

    if (!result.ok) {
      // Snap back to exactly the state before the drag, not a recomputed one.
      setBoard(before);
      toast.error(result.error);
      return;
    }

    toast.success(`${ticket.ticket_number} moved to ${STATUS_LABELS[to]}.`);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {BOARD_COLUMNS.map((status) => {
          const column = board[status];

          // While dragging, dim every column the workflow will not accept.
          const disabled =
            activeTicket !== null &&
            activeTicket.status !== status &&
            !canTransition(activeTicket.status, status);

          return (
            <BoardColumn
              key={status}
              status={status}
              count={column.tickets.length}
              total={column.total}
              disabled={disabled}
            >
              {column.tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  draggable={isDraggable(ticket)}
                  isDragging={ticket.id === activeId}
                />
              ))}
            </BoardColumn>
          );
        })}
      </div>

      <DragOverlay>
        {activeTicket ? (
          <TicketCard ticket={activeTicket} draggable={false} overlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
