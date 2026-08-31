import {
  LayoutDashboard,
  Ticket,
  Users,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

import { hasAtLeastRole } from "@/lib/auth/permissions";
import type { Profile, UserRole } from "@/types/app";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
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
        icon: LayoutDashboard,
        minRole: "USER",
      },
      {
        href: "/tickets",
        label: "Tickets",
        icon: Ticket,
        minRole: "USER",
        prefix: true,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/admin/users",
        label: "Users",
        icon: Users,
        minRole: "ADMIN",
        prefix: true,
      },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/profile", label: "Profile", icon: UserCircle, minRole: "USER" },
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

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return item.prefix
    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
    : pathname === item.href;
}
