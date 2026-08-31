"use client";

import Link from "next/link";
import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/tickets/constants";
import type { TicketStatus } from "@/types/app";

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
  children,
}: {
  status: TicketStatus;
  count: number;
  total: number;
  disabled: boolean;
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
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-xs font-medium",
            STATUS_STYLES[status],
          )}
        >
          {STATUS_LABELS[status]}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
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
