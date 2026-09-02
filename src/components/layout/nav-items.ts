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
  | "members"
  | "notifications"
  | "profile";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  /** Minimum GLOBAL role required — really only "system admin or not". */
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
        // Everyone in the project. A MEMBER only sees their own tickets, but a
        // board of those grouped by status is still a useful view — and the
        // cards themselves are only draggable where the workflow allows it.
        href: "/tickets/board",
        label: "Board",
        icon: "board",
        minRole: "USER",
      },
      {
        // Personal, not project-scoped: RLS limits the page to your own rows,
        // so it needs no role gate at all.
        href: "/notifications",
        label: "Notifications",
        icon: "notifications",
        minRole: "USER",
      },
      {
        // Visible to everyone: the page shows who is in the project and
        // degrades to read-only unless you manage it.
        href: "/projects/members",
        label: "Members",
        icon: "members",
        minRole: "USER",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        // Anyone can create and see their own projects; the page is scoped by
        // RLS rather than by role.
        href: "/admin/projects",
        label: "Projects",
        icon: "projects",
        minRole: "USER",
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
