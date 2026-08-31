"use client";

import Link from "next/link";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/tickets/constants";
import type { Category, Project, TicketStatus } from "@/types/app";

/**
 * One board column.
 *
 * `disabled` comes from `canTransition()` in the parent. A column that cannot
 * accept the card currently being dragged is dimmed, so the workflow rule is
 * visible while dragging rather than discovered by a failed drop.
 */
export function BoardColumn({
  status,
  count,
  total,
  disabled,
  projectId,
  projects,
  categories,
  canSchedule,
  children,
}: {
  status: TicketStatus;
  count: number;
  total: number;
  disabled: boolean;
  projectId: string;
  projects: Project[];
  categories: Category[];
  canSchedule: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled });
  const hidden = total - count;

  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABELS[status]}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors",
        isOver && !disabled && "border-ring bg-accent/40 ring-2 ring-ring",
        disabled && "opacity-40",
      )}
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-xs font-medium",
            STATUS_STYLES[status],
          )}
        >
          {STATUS_LABELS[status]}
        </span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {total}
        </span>

        {/* Creates the ticket directly in this column — guard_ticket_insert()
            accepts the starting status from staff. */}
        <NewTicketDialog
          categories={categories}
          projects={projects}
          defaultProjectId={projectId}
          canSchedule={canSchedule}
          defaultStatus={status}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground"
              aria-label={`Add a ticket to ${STATUS_LABELS[status]}`}
            >
              <Plus className="size-4" aria-hidden />
            </Button>
          }
        />
      </header>

      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {count === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Nothing here
          </p>
        ) : (
          children
        )}

        {hidden > 0 ? (
          <Link
            href={`/tickets?status=${status}`}
            className="rounded-md border border-dashed px-3 py-2 text-center text-xs text-muted-foreground hover:bg-muted"
          >
            +{hidden} more — open in list
          </Link>
        ) : null}
      </div>
    </section>
  );
}
