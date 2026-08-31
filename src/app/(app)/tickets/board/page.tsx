import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { TicketBoard } from "@/components/tickets/ticket-board";
import { ViewToggle } from "@/components/tickets/view-toggle";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { requireUser } from "@/lib/auth/require-user";
import { listBoardTickets, listCategories } from "@/lib/tickets/queries";
import {
  getTicketActor,
  isProjectStaff,
  listAssignableMembers,
} from "@/lib/projects/access";
import { getActiveProject, listProjects } from "@/lib/projects/active";
import { NoProjects } from "@/components/projects/no-projects";

export const metadata: Metadata = {
  title: "Board",
};

export default async function TicketBoardPage() {
  const { profile } = await requireUser("/tickets/board");

  const activeProject = await getActiveProject();

  if (!activeProject) {
    return (
      <>
        <PageHeader title="Board" />
        <NoProjects />
      </>
    );
  }

  const [actor, board, agents, categories, projects] = await Promise.all([
    getTicketActor(profile, activeProject.id),
    listBoardTickets(activeProject.id),
    listAssignableMembers(activeProject.id),
    listCategories(),
    listProjects(),
  ]);

  // The real gate, now on the PROJECT role: someone who only raises tickets
  // here has at most one legal drag, so the board is not for them. Checked
  // server-side — the hidden nav item is not the protection.
  if (!isProjectStaff(actor)) {
    redirect("/tickets");
  }

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
            />
          </>
        }
      />

      <TicketBoard
        initial={board}
        actor={actor}
        agents={agents}
        categories={categories}
        projects={projects}
        projectId={activeProject.id}
      />
    </>
  );
}
