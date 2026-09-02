import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { NewTicketForm } from "@/components/tickets/new-ticket-form";
import { requireUser } from "@/lib/auth/require-user";
import { listCategories } from "@/lib/tickets/queries";
import { getActiveProjectId, listProjects } from "@/lib/projects/active";
import {
  getTicketActor,
  getTicketAssigning,
  isProjectStaff,
} from "@/lib/projects/access";
import { NoProjects } from "@/components/projects/no-projects";

export const metadata: Metadata = {
  title: "New ticket",
};

export default async function NewTicketPage() {
  const { profile } = await requireUser("/tickets/new");

  const [categories, projects, activeProjectId] = await Promise.all([
    listCategories(),
    listProjects(),
    getActiveProjectId(),
  ]);

  // Scheduling is offered per the caller's role in the pre-selected project.
  // Switching project inside the form does not re-evaluate this, but the insert
  // guard strips dates from a requester regardless.
  const actor = activeProjectId
    ? await getTicketActor(profile, activeProjectId)
    : null;

  const assigning =
    actor && activeProjectId
      ? await getTicketAssigning(actor, activeProjectId)
      : undefined;

  // A ticket cannot exist without a project, so there is nothing to show.
  if (projects.length === 0) {
    return (
      <>
        <PageHeader title="New ticket" />
        <NoProjects />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New ticket"
        description="Tell us what's wrong and we'll pick it up."
        actions={
          <Button variant="outline" asChild>
            <Link href="/tickets">
              <ArrowLeft aria-hidden />
              Back to tickets
            </Link>
          </Button>
        }
      />

      <Card className="max-w-5xl">
        <CardHeader>
          <CardTitle>Ticket details</CardTitle>
          <CardDescription>
            You&apos;ll be able to follow progress and add comments once it&apos;s
            raised.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewTicketForm
            categories={categories}
            projects={projects}
            defaultProjectId={activeProjectId ?? undefined}
            canSchedule={actor ? isProjectStaff(actor) : false}
            assigning={assigning}
          />
        </CardContent>
      </Card>
    </>
  );
}
