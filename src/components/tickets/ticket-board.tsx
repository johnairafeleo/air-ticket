"use client";

import { useMemo, useState } from "react";
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
import { canEditTicketDetails } from "@/lib/auth/permissions";
import { canCreateTickets, isProjectStaff } from "@/lib/projects/roles";
import type { TicketAssigning } from "@/components/tickets/new-ticket-form";
import type { BoardData } from "@/lib/tickets/queries";
import type {
  Category,
  Project,
  ProjectMemberWithProfile,
  TicketActor,
  TicketStatus,
  TicketWithRelations,
} from "@/types/app";

/**
 * The Kanban board.
 *
 * `initial` is the source of truth and comes from the server on every
 * revalidation. Local state holds ONLY in-flight optimistic moves, and the
 * rendered board is derived from the two. Copying the server data into state
 * would freeze it at mount, so an edit or a change made elsewhere would never
 * appear.
 *
 * The database remains authoritative: `updateTicketStatus` goes through the
 * same guards as every other path, and a rejection drops the override so the
 * card snaps back.
 */
export function TicketBoard({
  initial,
  actor,
  agents,
  categories,
  projects,
  projectId,
  assigning,
}: {
  initial: BoardData;
  actor: TicketActor;
  /** Passed down so the card modal's controls need no extra fetch. */
  agents: ProjectMemberWithProfile[];
  categories: Category[];
  /** For the per-column "New ticket" dialogs. */
  projects: Project[];
  projectId: string;
  /** Offers the assignee picker in each column's "New ticket" dialog. */
  assigning?: TicketAssigning;
}) {
  /** ticket id -> status the user dragged it to, pending server confirmation. */
  const [pending, setPending] = useState<Record<string, TicketStatus>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    // A small threshold keeps a click on the card's link a click rather than an
    // accidental micro-drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const board = useMemo<BoardData>(() => {
    const out = Object.fromEntries(
      BOARD_COLUMNS.map((s) => [
        s,
        { tickets: [] as TicketWithRelations[], total: initial[s].total },
      ]),
    ) as BoardData;

    for (const source of BOARD_COLUMNS) {
      for (const ticket of initial[source].tickets) {
        const target = pending[ticket.id] ?? source;

        if (target === source) {
          out[source].tickets.push(ticket);
          continue;
        }

        // Override still outstanding: show the card where the user put it, and
        // shift the column counts to match. Once the server catches up, the
        // override equals the real status and this branch stops firing.
        out[target].tickets.unshift({ ...ticket, status: target });
        out[source].total -= 1;
        out[target].total += 1;
      }
    }

    return out;
  }, [initial, pending]);

  const isStaff = isProjectStaff(actor);
  // A VIEWER cannot raise tickets at all. Everyone else is staff since 0017.
  const canCreate = canCreateTickets(actor);

  const allTickets = BOARD_COLUMNS.flatMap((s) => board[s].tickets);
  const activeTicket = allTickets.find((t) => t.id === activeId) ?? null;

  function isDraggable(ticket: TicketWithRelations): boolean {
    return availableStatuses(actor, ticket.status).length > 0;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);

    const { active, over } = event;
    if (!over) return;

    const id = String(active.id);
    const ticket = allTickets.find((t) => t.id === id);
    if (!ticket) return;

    const from = ticket.status;
    const to = over.id as TicketStatus;
    if (from === to || !canTransition(from, to)) return;

    setPending((p) => ({ ...p, [id]: to }));

    const result = await updateTicketStatus({ ticketId: id, status: to });

    if (!result.ok) {
      // Drop the override; the card returns to wherever the server says it is.
      setPending((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
      toast.error(result.error);
      return;
    }

    // Deliberately keep the override until revalidated props arrive. Clearing
    // it here would flash the card back to its old column for a frame.
    toast.success(`${ticket.ticket_number} moved to ${STATUS_LABELS[to]}.`);
  }

  return (
    <DndContext
      // Required for SSR. dnd-kit derives the `aria-describedby` on every
      // draggable from useUniqueId(), which is a MODULE-LEVEL counter rather
      // than React's useId — so the server renders DndDescribedBy-0 while the
      // client, whose counter has already been advanced by StrictMode's double
      // invoke, renders -1, and React reports a hydration mismatch on every
      // card. Passing an explicit id makes useUniqueId return it verbatim.
      id="ticket-board"
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
              projectId={projectId}
              projects={projects}
              categories={categories}
              canSchedule={isStaff}
              assigning={assigning}
              canAddHere={
                canCreate && (isStaff || status === "OPEN")
              }
            >
              {column.tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  draggable={isDraggable(ticket)}
                  actor={actor}
                  agents={agents}
                  categories={categories}
                  canEdit={canEditTicketDetails(actor)}
                  isDragging={ticket.id === activeId}
                />
              ))}
            </BoardColumn>
          );
        })}
      </div>

      <DragOverlay>
        {activeTicket ? (
          <TicketCard
            ticket={activeTicket}
            draggable={false}
            actor={actor}
            agents={agents}
            categories={categories}
            overlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
