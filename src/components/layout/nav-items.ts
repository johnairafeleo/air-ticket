import { hasAtLeastRole } from "@/lib/auth/permissions";
import type { Profile, UserRole } from "@/types/app";

/**
 * Navigation model.
 *
 * `icon` is a NAME, not a component. These objects are built in Server
 * Components and handed to Client Components, and only plain serializable data
 * survives that boundary — passing a Lucide component reference throws
 * "Only plain objects can be passed to Client Components".
 *
 * The name is resolved to an actual icon in `sidebar-nav.tsx`, which is a
 * Client Component and can hold component references.
 */

export type NavIconName =
  | "dashboard"
  | "tickets"
  | "board"
  | "users"
  | "projects"
  | "profile";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  /** Minimum role required to see this item. */
  minRole: UserRole;
  /** Match child routes too (e.g. /tickets/123 highlights /tickets). */
  prefix?: boolean;
};

export type NavSection = {
  label: string | null;
  items: NavItem[];
};

const SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: "dashboard",
        minRole: "USER",
      },
      {
        href: "/tickets",
        label: "Tickets",
        icon: "tickets",
        minRole: "USER",
        prefix: true,
      },
      {
        // Staff only: a USER's single legal drag is Resolved -> Closed on their
        // own ticket, so the board would be almost entirely inert for them.
        href: "/tickets/board",
        label: "Board",
        icon: "board",
        minRole: "AGENT",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/admin/projects",
        label: "Projects",
        icon: "projects",
        minRole: "ADMIN",
        prefix: true,
      },
      {
        href: "/admin/users",
        label: "Users",
        icon: "users",
        minRole: "ADMIN",
        prefix: true,
      },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/profile", label: "Profile", icon: "profile", minRole: "USER" },
    ],
  },
];

/**
 * Navigation visible to `profile`.
 *
 * Hiding a link is presentation only — the pages behind them enforce the same
 * rule server-side via `requireRole()`, so removing the nav item is never what
 * keeps anyone out.
 */
export function navSectionsFor(profile: Profile): NavSection[] {
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => hasAtLeastRole(profile, item.minRole)),
  })).filter((section) => section.items.length > 0);
}

function matches(item: NavItem, pathname: string): boolean {
  return item.prefix
    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
    : pathname === item.href;
}

/**
 * The single nav href that should be highlighted for `pathname`.
 *
 * Longest match wins. Without this, `/tickets/board` would light up both
 * "Tickets" (which matches by prefix) and "Board" (which matches exactly).
 * Returns null when nothing matches.
 */
export function activeHref(sections: NavSection[], pathname: string): string | null {
  let best: string | null = null;

  for (const section of sections) {
    for (const item of section.items) {
      if (matches(item, pathname) && item.href.length > (best?.length ?? -1)) {
        best = item.href;
      }
    }
  }

  return best;
}
