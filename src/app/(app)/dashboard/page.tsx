import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Plus,
  Ticket as TicketIcon,
  UserCheck,
  Users,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// The workload RPC returns no avatar_url, so initials are the only fallback needed.
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/page-header";
import { RoleBadge } from "@/components/layout/role-badge";
import { BreakdownBar, StatCard } from "@/components/dashboard/stat-card";
import { PriorityBadge, StatusBadge } from "@/components/tickets/ticket-badges";
import { requireUser } from "@/lib/auth/require-user";
import { getDashboardStats } from "@/lib/tickets/dashboard";
import { listTickets } from "@/lib/tickets/queries";
import {
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  STATUS_LABELS,
} from "@/lib/tickets/constants";
import { initialsOf, displayName } from "@/lib/users";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/types/app";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const { profile } = await requireUser("/dashboard");

  const [stats, recent] = await Promise.all([
    getDashboardStats(),
    listTickets(profile, { page: 1, scope: "all" }),
  ]);

  const isStaff = profile.role !== "USER";
  const firstName = profile.full_name?.split(" ")[0] ?? "there";

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={
          isStaff
            ? "Everything on your desk right now."
            : "Your support requests at a glance."
        }
        actions={
          <>
            <RoleBadge role={profile.role} />
            <Button asChild>
              <Link href="/tickets/new">
                <Plus aria-hidden />
                New ticket
              </Link>
            </Button>
          </>
        }
      />

      {/* Headline numbers. Which four matter depends on the role: a requester
          cares about their own queue, staff care about the work coming in. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isStaff ? (
          <>
            <StatCard
              label="Assigned to me"
              value={stats.assigned_to_me}
              icon={UserCheck}
              href="/tickets?scope=assigned"
            />
            <StatCard
              label="Unassigned"
              value={stats.unassigned}
              icon={Inbox}
              href="/tickets?scope=unassigned"
              emphasis
            />
            <StatCard
              label="High or urgent"
              value={stats.urgent}
              icon={AlertTriangle}
              href="/tickets?priority=URGENT"
              emphasis
            />
            <StatCard
              label="Still open"
              value={stats.open_like}
              icon={TicketIcon}
              href="/tickets?status=OPEN"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Open"
              value={stats.by_status.OPEN}
              icon={TicketIcon}
              href="/tickets?status=OPEN"
            />
            <StatCard
              label="In progress"
              value={stats.by_status.IN_PROGRESS}
              icon={UserCheck}
              href="/tickets?status=IN_PROGRESS"
            />
            <StatCard
              label="Pending"
              value={stats.by_status.PENDING}
              icon={Inbox}
              href="/tickets?status=PENDING"
            />
            <StatCard
              label="Resolved"
              value={stats.by_status.RESOLVED}
              icon={CheckCircle2}
              href="/tickets?status=RESOLVED"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent tickets</CardTitle>
            <CardDescription>
              {isStaff
                ? "The most recently raised tickets you can see."
                : "Your most recent requests."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {recent.tickets.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-medium">No tickets yet</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  When one is raised it will appear here.
                </p>
                <Button asChild size="sm">
                  <Link href="/tickets/new">Raise the first ticket</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {recent.tickets.slice(0, 6).map((ticket) => (
                  <li key={ticket.id} className="flex items-center gap-3 py-2.5">
                    <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                      {ticket.ticket_number}
                    </span>
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {ticket.title}
                    </Link>
                    <PriorityBadge
                      priority={ticket.priority}
                      className="hidden sm:inline-flex"
                    />
                    <StatusBadge status={ticket.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {TICKET_STATUSES.map((status) => (
              <BreakdownBar
                key={status}
                label={STATUS_LABELS[status]}
                value={stats.by_status[status]}
                total={stats.total}
                href={`/tickets?status=${status}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By priority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {TICKET_PRIORITIES.map((priority) => (
              <BreakdownBar
                key={priority}
                label={PRIORITY_LABELS[priority]}
                value={stats.by_priority[priority]}
                total={stats.total}
                className={PRIORITY_STYLES[priority]
                  .split(" ")
                  .filter((c) => c.startsWith("bg-"))
                  .join(" ")}
                href={`/tickets?priority=${priority}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.by_category.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nothing to show yet.
              </p>
            ) : (
              stats.by_category.map((category) => (
                <BreakdownBar
                  key={category.name}
                  label={category.name}
                  value={category.count}
                  total={stats.total}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* Workload is only meaningful when you can see other people's tickets,
            which RLS restricts to admins. */}
        {profile.role === "ADMIN" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4" aria-hidden />
                Agent workload
              </CardTitle>
              <CardDescription>Open tickets per assignee.</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.workload.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nothing is assigned yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {stats.workload.map((agent) => (
                    <li key={agent.id} className="flex items-center gap-3">
                      <Avatar className="size-7">
                        <AvatarFallback className="text-[10px]">
                          {initialsOf(agent)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {displayName(agent)}
                      </span>
                      <span className="tabular-nums text-sm font-medium">
                        {agent.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
