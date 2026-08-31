import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  STATUS_LABELS,
  STATUS_STYLES,
} from "@/lib/tickets/constants";
import type { TicketPriority, TicketStatus } from "@/types/app";

export function StatusBadge({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TicketPriority;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(PRIORITY_STYLES[priority], className)}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}
