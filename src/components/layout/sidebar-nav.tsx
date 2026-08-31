"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Columns3,
  LayoutDashboard,
  Ticket,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  activeHref,
  type NavIconName,
  type NavSection,
} from "@/components/layout/nav-items";

/**
 * Icon names to components.
 *
 * This lives on the client because component references cannot cross the
 * Server -> Client boundary; the nav data carries a plain string instead.
 */
const ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  tickets: Ticket,
  board: Columns3,
  users: Users,
  profile: UserCircle,
};

/**
 * The navigation list itself, shared by the desktop sidebar and the mobile
 * sheet so the two can never drift apart.
 */
export function SidebarNav({
  sections,
  onNavigate,
}: {
  sections: NavSection[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // Resolved once for the whole nav so only the most specific route lights up.
  const current = activeHref(sections, pathname);

  return (
    <nav className="flex flex-1 flex-col gap-6 px-3 py-4" aria-label="Main">
      {sections.map((section, index) => (
        <div key={section.label ?? `section-${index}`} className="space-y-1">
          {section.label ? (
            <h2 className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {section.label}
            </h2>
          ) : null}

          {section.items.map((item) => {
            const active = item.href === current;
            const Icon = ICONS[item.icon];

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
