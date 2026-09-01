import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { displayName, initialsOf } from "@/lib/users";
import type { TicketAssignee } from "@/types/app";

/**
 * Overlapping avatars for everyone on a ticket.
 *
 * A server component on purpose — it renders in cards, table rows and the
 * detail panel, none of which need it to be interactive, and `initialsOf` comes
 * from a non-client module so both sides can call it.
 *
 * Beyond `max` it shows a +N chip rather than growing without bound, because a
 * board card has a fixed width and a ticket with eight people on it would
 * otherwise push the priority badge off the edge.
 */
export function AssigneeStack({
  assignees,
  max = 3,
  size = "sm",
  className,
}: {
  assignees: TicketAssignee[];
  max?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  if (assignees.length === 0) return null;

  const shown = assignees.slice(0, max);
  const extra = assignees.length - shown.length;
  const box = size === "sm" ? "size-6" : "size-8";

  return (
    <div
      className={cn("flex items-center -space-x-1.5", className)}
      // The individual avatars are decorative and title-tagged; one label on the
      // group is what a screen reader actually needs.
      aria-label={`Assigned to ${assignees.map((a) => displayName(a)).join(", ")}`}
    >
      {shown.map((person) => (
        <Avatar
          key={person.id}
          className={cn(box, "ring-2 ring-background")}
          title={displayName(person)}
        >
          {person.avatar_url ? (
            <AvatarImage src={person.avatar_url} alt="" />
          ) : null}
          <AvatarFallback className="text-[10px]">
            {initialsOf(person)}
          </AvatarFallback>
        </Avatar>
      ))}

      {extra > 0 ? (
        <span
          className={cn(
            box,
            "z-10 flex items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background",
          )}
          title={assignees
            .slice(max)
            .map((a) => displayName(a))
            .join(", ")}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

/** Names in a line, for places with room for words rather than avatars. */
export function AssigneeNames({
  assignees,
  fallback = "Unassigned",
}: {
  assignees: TicketAssignee[];
  fallback?: string;
}) {
  if (assignees.length === 0) {
    return <span className="text-muted-foreground">{fallback}</span>;
  }

  return <>{assignees.map((a) => displayName(a)).join(", ")}</>;
}
