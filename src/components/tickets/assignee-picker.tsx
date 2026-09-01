"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { displayName } from "@/lib/users";
import type { ProjectMemberWithProfile, TicketAssignee } from "@/types/app";

/**
 * Choose one or more people for a ticket.
 *
 * A checkbox dropdown rather than a multi-select listbox: it keeps the whole
 * roster visible with the current picks ticked, and `Select` cannot hold more
 * than one value.
 *
 * `onChange` receives the COMPLETE new set, never a delta. The server action
 * diffs it against what is stored, which makes a repeated or out-of-order
 * click harmless.
 *
 * `canAssignOthers` mirrors the RLS policy rather than replacing it — an agent
 * may only add or remove themselves, so everyone else's row is disabled instead
 * of hidden. Hiding them would make a ticket someone else is on look empty.
 */
export function AssigneePicker({
  members,
  value,
  actorId,
  canAssignOthers,
  disabled = false,
  onChange,
  id,
}: {
  members: ProjectMemberWithProfile[];
  value: TicketAssignee[];
  actorId: string;
  canAssignOthers: boolean;
  disabled?: boolean;
  onChange: (assigneeIds: string[]) => void;
  id?: string;
}) {
  const selected = new Set(value.map((person) => person.id));

  function toggle(userId: string) {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    onChange([...next]);
  }

  const label =
    value.length === 0
      ? "Unassigned"
      : value.length === 1
        ? displayName(value[0])
        : `${value.length} people`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={value.length === 0 ? "text-muted-foreground" : ""}>
            {label}
          </span>
          <ChevronDown className="size-4 opacity-50" aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
      >
        <DropdownMenuLabel>Assign to</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {members.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            This project has no agents or managers yet.
          </p>
        ) : (
          members.map((member) => {
            const isSelf = member.user_id === actorId;

            return (
              <DropdownMenuCheckboxItem
                key={member.user_id}
                checked={selected.has(member.user_id)}
                disabled={!canAssignOthers && !isSelf}
                // Radix closes the menu on select; keeping it open lets several
                // people be ticked in one go.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => toggle(member.user_id)}
              >
                {isSelf ? "Me" : displayName(member.profile)}
              </DropdownMenuCheckboxItem>
            );
          })
        )}

        {!canAssignOthers ? (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Only a project manager can assign someone else.
            </p>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
