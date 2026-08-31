import type { Metadata } from "next";
import { Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { MemberManager } from "@/components/projects/member-manager";
import { NoProjects } from "@/components/projects/no-projects";
import { requireUser } from "@/lib/auth/require-user";
import { getActiveProject } from "@/lib/projects/active";
import {
  canManageProject,
  getTicketActor,
  listProjectMembers,
} from "@/lib/projects/access";

export const metadata: Metadata = {
  title: "Members",
};

export default async function ProjectMembersPage() {
  const { profile } = await requireUser("/projects/members");
  const activeProject = await getActiveProject();

  if (!activeProject) {
    return (
      <>
        <PageHeader title="Members" />
        <NoProjects />
      </>
    );
  }

  const [actor, members] = await Promise.all([
    getTicketActor(profile, activeProject.id),
    listProjectMembers(activeProject.id),
  ]);

  return (
    <>
      <PageHeader
        title={`Members · ${activeProject.name}`}
        description="Who can see this project, and what they can do in it."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" aria-hidden />
            Project members
          </CardTitle>
          <CardDescription>
            {members.length} {members.length === 1 ? "person" : "people"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {canManageProject(actor) ? (
            <MemberManager
              projectId={activeProject.id}
              members={members}
              currentUserId={profile.id}
            />
          ) : (
            // Members can see who else is here — RLS allows the read — but only
            // a manager may change anything.
            <>
              <Alert className="mb-4">
                <AlertTitle>Read only</AlertTitle>
                <AlertDescription>
                  Only a project manager can add or change members.
                </AlertDescription>
              </Alert>
              <ul className="divide-y">
                {members.map((m) => (
                  <li
                    key={m.user_id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span>{m.profile?.full_name ?? m.profile?.email}</span>
                    <span className="text-muted-foreground">{m.role}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
