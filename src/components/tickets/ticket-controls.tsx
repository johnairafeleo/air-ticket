"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { TicketSchedule } from "@/components/tickets/ticket-schedule";
import {
  assignTicket,
  updateTicketCategory,
  updateTicketPriority,
  updateTicketStatus,
} from "@/app/(app)/tickets/actions";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  availableStatuses,
} from "@/lib/tickets/constants";
import {
  TICKET_PRIORITIES,
  type Category,
  type Profile,
  type TicketWithRelations,
} from "@/types/app";

const UNASSIGNED = "__unassigned__";
const NO_CATEGORY = "__none__";

/**
 * The side-panel controls on a ticket.
 *
 * What's rendered follows the same rules as `guard_ticket_change()`: a
 * requester sees a read-only summary plus (once resolved) a Close option, while
 * agents and admins get the full set. Anything this hides, the database refuses
 * anyway — this just avoids offering dead controls.
 */
export function TicketControls({
  ticket,
  actor,
  agents,
  categories,
}: {
  ticket: TicketWithRelations;
  actor: Profile;
  agents: Profile[];
  categories: Category[];
}) {
  const [pending, startTransition] = useTransition();

  const isOwner = ticket.created_by === actor.id;
  const isStaff = actor.role === "AGENT" || actor.role === "ADMIN";
  const statuses = availableStatuses(actor, ticket.status, isOwner);

  // Agents may claim or release, but only admins may hand work to someone else.
  const assignableAgents =
    actor.role === "ADMIN" ? agents : agents.filter((a) => a.id === actor.id);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(success);
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ticket-status" className="text-xs uppercase tracking-wide text-muted-foreground">Status</Label>
        {statuses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {ticket.status === "CLOSED"
              ? "This ticket is closed. Raise a new one if the problem returns."
              : "Support staff will update this as they work on it."}
          </p>
        ) : (
          <Select
            value={ticket.status}
            disabled={pending}
            onValueChange={(status) =>
              run(
                () => updateTicketStatus({ ticketId: ticket.id, status }),
                `Status set to ${STATUS_LABELS[status as keyof typeof STATUS_LABELS]}.`,
              )
            }
          >
            <SelectTrigger id="ticket-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* The current status is always present so the trigger has a
                  matching option, even though it is not a real transition. */}
              <SelectItem value={ticket.status}>
                {STATUS_LABELS[ticket.status]}
              </SelectItem>
              {statuses
                .filter((s) => s !== ticket.status)
                .map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ticket-priority" className="text-xs uppercase tracking-wide text-muted-foreground">Priority</Label>
        {isStaff ? (
          <Select
            value={ticket.priority}
            disabled={pending}
            onValueChange={(priority) =>
              run(
                () => updateTicketPriority({ ticketId: ticket.id, priority }),
                "Priority updated.",
              )
            }
          >
            <SelectTrigger id="ticket-priority" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm">{PRIORITY_LABELS[ticket.priority]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ticket-category" className="text-xs uppercase tracking-wide text-muted-foreground">Category</Label>
        {isStaff ? (
          <Select
            value={ticket.category_id ?? NO_CATEGORY}
            disabled={pending}
            onValueChange={(value) =>
              run(
                () =>
                  updateTicketCategory({
                    ticketId: ticket.id,
                    categoryId: value === NO_CATEGORY ? "" : value,
                  }),
                "Category updated.",
              )
            }
          >
            <SelectTrigger id="ticket-category" className="w-full">
              <SelectValue placeholder="Uncategorised" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>Uncategorised</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm">
            {ticket.category?.name ?? (
              <span className="text-muted-foreground">Uncategorised</span>
            )}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ticket-assignee" className="text-xs uppercase tracking-wide text-muted-foreground">Assigned to</Label>
        {isStaff ? (
          <Select
            value={ticket.assigned_to ?? UNASSIGNED}
            disabled={pending}
            onValueChange={(value) =>
              run(
                () =>
                  assignTicket({
                    ticketId: ticket.id,
                    assigneeId: value === UNASSIGNED ? "" : value,
                  }),
                value === UNASSIGNED
                  ? "Returned to the unassigned queue."
                  : "Assignment updated.",
              )
            }
          >
            <SelectTrigger id="ticket-assignee" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {assignableAgents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.id === actor.id
                    ? "Me"
                    : (agent.full_name ?? agent.email)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm">
            {ticket.assignee?.full_name ??
              ticket.assignee?.email ?? (
                <span className="text-muted-foreground">
                  Not yet assigned
                </span>
              )}
          </p>
        )}
      </div>

      <div className="pt-1">
        <TicketSchedule ticket={ticket} canEdit={isStaff} />
      </div>

      {pending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Saving…
        </p>
      ) : null}
    </div>
  );
}
