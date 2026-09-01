import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Inbox } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { displayName } from "@/lib/users";
import { AssigneeStack } from "@/components/tickets/assignee-stack";
import { PriorityBadge, StatusBadge } from "@/components/tickets/ticket-badges";
import type { TicketWithRelations } from "@/types/app";

export function TicketTable({ tickets }: { tickets: TicketWithRelations[] }) {
  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Inbox className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <p className="font-medium">No tickets found</p>
          <p className="text-sm text-muted-foreground">
            Try adjusting your filters, or raise a new ticket.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/tickets/new">New ticket</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Ticket</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
            <TableHead className="w-[110px]">Priority</TableHead>
            <TableHead className="w-[140px]">Category</TableHead>
            <TableHead className="w-[180px]">Assigned to</TableHead>
            <TableHead className="w-[130px]">Updated</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {tickets.map((ticket) => (
            <TableRow key={ticket.id} className="group">
              <TableCell className="font-mono text-xs text-muted-foreground">
                {ticket.ticket_number}
              </TableCell>

              <TableCell className="max-w-[360px]">
                {/* The whole row reads as clickable, but only the title is a
                    real link so the row stays keyboard-navigable. */}
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="block truncate font-medium underline-offset-4 hover:underline"
                >
                  {ticket.title}
                </Link>
                <span className="text-xs text-muted-foreground">
                  by {ticket.creator?.full_name ?? ticket.creator?.email ?? "Unknown"}
                </span>
              </TableCell>

              <TableCell>
                <StatusBadge status={ticket.status} />
              </TableCell>

              <TableCell>
                <PriorityBadge priority={ticket.priority} />
              </TableCell>

              <TableCell className="text-sm">
                {ticket.category?.name ?? (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>

              <TableCell>
                {ticket.assignees.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <AssigneeStack assignees={ticket.assignees} />
                    {ticket.assignees.length === 1 ? (
                      <span className="truncate text-sm">
                        {displayName(ticket.assignees[0])}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {ticket.assignees.length} people
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Unassigned</span>
                )}
              </TableCell>

              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(ticket.updated_at), {
                  addSuffix: true,
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
