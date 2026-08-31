import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { TicketTable } from "@/components/tickets/ticket-table";
import { ViewToggle } from "@/components/tickets/view-toggle";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { requireUser } from "@/lib/auth/require-user";
import { listCategories, listTickets } from "@/lib/tickets/queries";
import { getActiveProject, listProjects } from "@/lib/projects/active";
import { NoProjects } from "@/components/projects/no-projects";
import { ticketFiltersSchema } from "@/lib/validations/ticket";

export const metadata: Metadata = {
  title: "Tickets",
};

export default async function TicketsPage(props: PageProps<"/tickets">) {
  const { profile } = await requireUser("/tickets");
  const searchParams = await props.searchParams;

  // Unparseable query strings fall back to defaults rather than erroring — a
  // hand-edited URL should not break the page.
  const parsed = ticketFiltersSchema.safeParse(searchParams);
  const filters = parsed.success ? parsed.data : ticketFiltersSchema.parse({});

  const activeProject = await getActiveProject();

  if (!activeProject) {
    return (
      <>
        <PageHeader title="Tickets" />
        <NoProjects isAdmin={profile.role === "ADMIN"} />
      </>
    );
  }

  const [categories, projects, result] = await Promise.all([
    listCategories(),
    listProjects(),
    listTickets(profile, filters, activeProject.id),
  ]);

  const description =
    profile.role === "USER"
      ? "Tickets you have raised."
      : "Tickets assigned to you, plus the unassigned queue.";

  return (
    <>
      <PageHeader
        title={`Tickets · ${activeProject.name}`}
        description={profile.role === "ADMIN" ? "All tickets." : description}
        actions={
          <>
            {/* The board route is gated on AGENT, so offering the toggle to a
                USER would just link them to a redirect. */}
            {profile.role !== "USER" ? <ViewToggle /> : null}
            <NewTicketDialog
              categories={categories}
              projects={projects}
              defaultProjectId={activeProject.id}
              canSchedule={profile.role !== "USER"}
            />
          </>
        }
      />

      <TicketFilters categories={categories} actor={profile} />

      <Card>
        <CardContent className="p-0">
          <TicketTable tickets={result.tickets} />
        </CardContent>
      </Card>

      {result.pageCount > 1 ? (
        <nav
          className="mt-4 flex items-center justify-between"
          aria-label="Pagination"
        >
          <p className="text-sm text-muted-foreground">
            Page {result.page} of {result.pageCount} · {result.total} ticket
            {result.total === 1 ? "" : "s"}
          </p>

          <div className="flex gap-2">
            <PageLink
              searchParams={searchParams}
              page={result.page - 1}
              disabled={result.page <= 1}
            >
              Previous
            </PageLink>
            <PageLink
              searchParams={searchParams}
              page={result.page + 1}
              disabled={result.page >= result.pageCount}
            >
              Next
            </PageLink>
          </div>
        </nav>
      ) : null}
    </>
  );
}

/** Pagination link that preserves the active filters. */
function PageLink({
  searchParams,
  page,
  disabled,
  children,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string" && key !== "page") params.set(key, value);
  }
  params.set("page", String(page));

  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`/tickets?${params.toString()}`}>{children}</Link>
    </Button>
  );
}
