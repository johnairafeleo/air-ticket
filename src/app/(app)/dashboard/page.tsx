import type { Metadata } from "next";
import { Ticket } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { RoleBadge } from "@/components/layout/role-badge";
import { requireUser } from "@/lib/auth/require-user";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { UserRole } from "@/types/app";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Phase 1 placeholder. The real per-role statistics arrive in Phase 4, once
 * tickets exist to count — the copy below states what each role will see so the
 * shell is testable now without faking numbers.
 */
const UPCOMING: Record<UserRole, string[]> = {
  USER: ["My open tickets", "My pending tickets", "My resolved tickets", "Recent activity"],
  AGENT: [
    "Assigned to me",
    "Unassigned queue",
    "Pending tickets",
    "High and urgent priority",
  ],
  ADMIN: [
    "Tickets by status",
    "Tickets by priority",
    "Tickets by category",
    "Agent workload",
  ],
};

export default async function DashboardPage() {
  // Repeated here on purpose: the layout's check does not protect this page.
  const { profile } = await requireUser("/dashboard");
  const firstName = profile.full_name?.split(" ")[0] ?? "there";

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Your support desk overview."
        actions={<RoleBadge role={profile.role} />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="size-4" aria-hidden />
            Ticketing is not enabled yet
          </CardTitle>
          <CardDescription>
            Phase 1 set up accounts, roles and access control. Tickets arrive in
            Phase 2, and this dashboard will then show the {ROLE_LABELS[profile.role]}{" "}
            view:
          </CardDescription>
        </CardHeader>

        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {UPCOMING[profile.role].map((metric) => (
              <li
                key={metric}
                className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
              >
                {metric}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
