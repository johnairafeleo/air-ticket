import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A single headline number.
 *
 * `href` is optional: a stat that has somewhere useful to go becomes a link to
 * the matching filtered ticket list, which is usually the next thing you want.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  emphasis,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  href?: string;
  /** Draw attention when the number is non-zero and needs action. */
  emphasis?: boolean;
}) {
  const content = (
    <Card
      className={cn(
        "transition-colors",
        href && "hover:border-ring hover:bg-accent/30",
        emphasis && value > 0 && "border-orange-500/40 bg-orange-500/5",
      )}
    >
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        <Icon
          className={cn(
            "size-5 shrink-0 text-muted-foreground",
            emphasis && value > 0 && "text-orange-600 dark:text-orange-400",
          )}
          aria-hidden
        />
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      {content}
    </Link>
  ) : (
    content
  );
}

/**
 * A labelled proportion bar.
 *
 * Deliberately not a chart library — these are single-dimension breakdowns, and
 * a bar communicates them as well as a pie without a new dependency.
 */
export function BreakdownBar({
  label,
  value,
  total,
  className,
  href,
}: {
  label: string;
  value: number;
  total: number;
  className?: string;
  href?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;

  const row = (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value}
          <span className="ml-1 text-xs">({pct}%)</span>
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${label}: ${value} of ${total}`}
      >
        <div
          className={cn("h-full rounded-full bg-primary transition-all", className)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block rounded-md hover:opacity-80">
      {row}
    </Link>
  ) : (
    row
  );
}
