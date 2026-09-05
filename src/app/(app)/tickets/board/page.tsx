import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { TicketBoard } from "@/components/tickets/ticket-board";
import { ViewToggle } from "@/components/tickets/view-toggle";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { requireUser } from "@/lib/auth/require-user";
import {
  listBoardTickets,
  listCategories,
  listTicketPeople,
  type TicketPerson,
} from "@/lib/tickets/queries";
import { ticketFiltersSchema } from "@/lib/validations/ticket";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import {
  getTicketActor,
  getTicketAssigning,
  isProjectStaff,
  listAssignableMembers,
  listProjectMembers,
} from "@/lib/projects/access";
import { getActiveProject, listProjects } from "@/lib/projects/active";
import { NoProjects } from "@/components/projects/no-projects";

export const metadata: Metadata = {
  title: "Board",
};

export default async function TicketBoardPage(
  props: PageProps<"/tickets/board">,
) {
  const { profile } = await requireUser("/tickets/board");

  const searchParams = await props.searchParams;
  // Same schema as the list, so one URL means the same thing in both views.
  // A bad value degrades to "no filter" rather than failing the page.
  const parsed = ticketFiltersSchema.safeParse(searchParams);
  const filters = parsed.success
    ? parsed.data
    : ticketFiltersSchema.parse({});

  const activeProject = await getActiveProject();

  if (!activeProject) {
    return (
      <>
        <PageHeader title="Board" />
        <NoProjects />
      </>
    );
  }

  const [actor, board, agents, categories, projects, members, people] =
    await Promise.all([
      getTicketActor(profile, activeProject.id),
      listBoardTickets(profile, filters, activeProject.id),
      listAssignableMembers(activeProject.id),
      listCategories(),
      listProjects(),
      listProjectMembers(activeProject.id),
      listTicketPeople(activeProject.id),
    ]);

  /** Union of current members and whoever appears on the tickets. */
  const peopleOptions = (extra: TicketPerson[]) => {
    const byId = new Map(extra.map((x) => [x.id, x]));
    for (const m of members) {
      if (m.profile && !byId.has(m.profile.id)) byId.set(m.profile.id, m.profile);
    }
    return [...byId.values()].sort((a, b) =>
      (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email),
    );
  };

  const assigning = await getTicketAssigning(actor, activeProject.id);

  // No role gate here any more: RLS already limits the board to tickets the
  // caller may see, and availableStatuses() decides which cards they can drag.
  // A member simply gets a smaller, mostly read-only board.

  return (
    <>
      <PageHeader
        title={`Board · ${activeProject.name}`}
        description="Drag a ticket to change its status."
        actions={
          <>
            <ViewToggle />
            <NewTicketDialog
              categories={categories}
              projects={projects}
              defaultProjectId={activeProject.id}
              canSchedule={isProjectStaff(actor)}
              assigning={assigning}
            />
          </>
        }
      />

      {/* Status is omitted: the board's columns already are the statuses, so a
          status filter would just empty the columns it excluded. */}
      <TicketFilters
        categories={categories}
        assigneeOptions={peopleOptions(people.assignees)}
        creatorOptions={peopleOptions(people.creators)}
        canSeeOthersTickets={isProjectStaff(actor)}
        showStatus={false}
      />

      <TicketBoard
        initial={board}
        actor={actor}
        assigning={assigning}
        agents={agents}
        categories={categories}
        projects={projects}
        projectId={activeProject.id}
      />
    </>
  );
}
