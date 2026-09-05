"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/tickets/constants";
import { displayName } from "@/lib/users";
import type { TicketPerson } from "@/lib/tickets/queries";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type Category,
} from "@/types/app";

/** Sentinel for "no filter" — Radix Select cannot hold an empty string value. */
const ANY = "__any__";

const SCOPES = [
  { value: "all", label: "All I can see" },
  { value: "mine", label: "Raised by me" },
  { value: "assigned", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
] as const;

export function TicketFilters({
  categories,
  assigneeOptions,
  creatorOptions,
  canSeeOthersTickets,
  showStatus = true,
}: {
  categories: Category[];
  /**
   * People who actually appear on this project's tickets, not the current
   * member list — someone who has left still shows in the Assigned to column,
   * so they must remain selectable here.
   */
  assigneeOptions: TicketPerson[];
  creatorOptions: TicketPerson[];
  /** Project agents, managers and system admins see more than their own. */
  canSeeOthersTickets: boolean;
  /**
   * The board passes false: its columns already are the statuses, so the
   * control would only ever blank out the columns it excluded.
   */
  showStatus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // The URL is the single source of truth for the search term. The input is
  // uncontrolled and keyed on that value, so a change from elsewhere (back
  // button, "Clear") remounts it with the right content — no state to sync, and
  // no re-render on every keystroke.
  const qParam = searchParams.get("q") ?? "";

  function apply(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "" || value === ANY) params.delete(key);
      else params.set(key, value);
    }

    // Any filter change invalidates the current page number.
    params.delete("page");

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  /**
   * Status and priority accept comma-separated lists, because dashboard cards
   * link to combinations like "high or urgent".
   *
   * The Select can only display one option, so: exactly one value selects that
   * option; several fall back to a value matching no item, which makes Radix
   * show the placeholder — set below to "N selected" so the state is stated
   * rather than silently misreported as "Any".
   */
  const statusValues = (searchParams.get("status") ?? "")
    .split(",")
    .filter(Boolean);
  const priorityValues = (searchParams.get("priority") ?? "")
    .split(",")
    .filter(Boolean);

  const selectValue = (values: string[]) =>
    values.length === 0 ? ANY : values.length === 1 ? values[0] : "";

  const current = {
    status: selectValue(statusValues),
    priority: selectValue(priorityValues),
    categoryId: searchParams.get("categoryId") ?? ANY,
    scope: searchParams.get("scope") ?? "all",
    assigneeId: searchParams.get("assigneeId") ?? ANY,
    createdBy: searchParams.get("createdBy") ?? ANY,
  };

  const hasFilters =
    Boolean(qParam) ||
    statusValues.length > 0 ||
    priorityValues.length > 0 ||
    current.categoryId !== ANY ||
    current.assigneeId !== ANY ||
    current.createdBy !== ANY ||
    current.scope !== "all";

  // A project MEMBER only ever sees their own tickets, so a scope picker would
  // be three inert options and one real one.
  const showScope = canSeeOthersTickets;

  return (
    // Wraps rather than sitting on one line. With six controls the old
    // `lg:flex-row` row overflowed the viewport and pushed the last filters off
    // the right edge, where they were unreachable without horizontal scrolling.
    <div className="mb-4 flex flex-col gap-3">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("q");
          apply({ q: typeof value === "string" ? value : null });
        }}
      >
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          key={qParam}
          name="q"
          defaultValue={qParam}
          placeholder="Search title, description or ticket number…"
          className="pl-9"
          aria-label="Search tickets"
        />
      </form>

      <div className="flex flex-wrap gap-2">
        {showScope ? (
          <Select value={current.scope} onValueChange={(v) => apply({ scope: v })}>
            <SelectTrigger className="w-[170px]" aria-label="Scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCOPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {showStatus ? (
          <Select value={current.status} onValueChange={(v) => apply({ status: v })}>
            <SelectTrigger className="w-[150px]" aria-label="Status">
              <SelectValue
                placeholder={
                  statusValues.length > 1
                    ? `${statusValues.length} statuses`
                    : "Status"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select
          value={current.priority}
          onValueChange={(v) => apply({ priority: v })}
        >
          <SelectTrigger className="w-[150px]" aria-label="Priority">
            <SelectValue
              placeholder={
                priorityValues.length > 1
                  ? `${priorityValues.length} priorities`
                  : "Priority"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any priority</SelectItem>
            {TICKET_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={current.categoryId}
          onValueChange={(v) => apply({ categoryId: v })}
        >
          <SelectTrigger className="w-[160px]" aria-label="Category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any category</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Person filters, hidden for anyone who only ever sees their own
            tickets — the list would be one real option and several that return
            nothing. */}
        {showScope ? (
          <>
            <Select
              value={current.assigneeId}
              onValueChange={(v) => apply({ assigneeId: v })}
            >
              <SelectTrigger className="w-[170px]" aria-label="Assigned person">
                <SelectValue placeholder="Assigned person" />
              </SelectTrigger>
              <SelectContent>
                {/* Reads "Assigned person" rather than "Any assigned person":
                    this is the resting label on the trigger, since the Select
                    shows the selected item's text and ANY is the default. */}
                <SelectItem value={ANY}>Assigned person</SelectItem>
                {assigneeOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {displayName(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={current.createdBy}
              onValueChange={(v) => apply({ createdBy: v })}
            >
              <SelectTrigger className="w-[170px]" aria-label="Raised by">
                <SelectValue placeholder="Raised by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Raised by anyone</SelectItem>
                {creatorOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {displayName(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}

        {hasFilters ? (
          <Button
            variant="ghost"
            onClick={() => startTransition(() => router.push(pathname))}
            disabled={pending}
          >
            <X aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
