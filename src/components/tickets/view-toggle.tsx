"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Columns3, List } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * List / Board switch.
 *
 * Rendered only for staff — the board route is gated on AGENT, so showing this
 * to a USER would offer a link that redirects them straight back.
 *
 * Carries the filters across. Both views parse the same query parameters, so
 * dropping them here would silently reset the user's filtering every time they
 * changed view — the one moment they are most likely to want it kept.
 */
export function ViewToggle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onBoard = pathname.startsWith("/tickets/board");

  // `page` is deliberately dropped: the board is not paginated, and page 3 of
  // the list means nothing once you arrive there.
  const params = new URLSearchParams(searchParams.toString());
  params.delete("page");
  const query = params.toString();
  const suffix = query ? `?${query}` : "";

  const base =
    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="inline-flex rounded-lg border bg-muted/50 p-1" role="group">
      <Link
        href={`/tickets${suffix}`}
        aria-current={!onBoard ? "page" : undefined}
        className={cn(
          base,
          !onBoard
            ? "bg-background shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <List className="size-4" aria-hidden />
        List
      </Link>

      <Link
        href={`/tickets/board${suffix}`}
        aria-current={onBoard ? "page" : undefined}
        className={cn(
          base,
          onBoard
            ? "bg-background shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Columns3 className="size-4" aria-hidden />
        Board
      </Link>
    </div>
  );
}
