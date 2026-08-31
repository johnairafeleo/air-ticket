import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import {
  CreateProjectDialog,
  EditProjectDialog,
} from "@/components/admin/project-dialogs";
import { requireRole } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function AdminProjectsPage() {
  await requireRole("ADMIN");

  const supabase = await createClient();
  // Admins see inactive projects too — the RLS policy allows it, and this is
  // where you would go to reactivate one.
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name");

  if (error) {
    return (
      <>
        <PageHeader title="Projects" />
        <Alert variant="destructive">
          <AlertTitle>Could not load projects</AlertTitle>
          <AlertDescription>Refresh to try again.</AlertDescription>
        </Alert>
      </>
    );
  }

  const rows = projects ?? [];

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project has its own ticket numbering."
        actions={<CreateProjectDialog />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="size-4" aria-hidden />
            All projects
          </CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "project" : "projects"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No projects yet. Create one to start raising tickets.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Key</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Tickets raised</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rows.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className="font-mono text-xs">
                        {project.key}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{project.name}</div>
                        {project.description ? (
                          <div className="truncate text-sm text-muted-foreground">
                            {project.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {project.is_active ? (
                          <Badge variant="outline">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">
                        {/* The counter only ever increases, so this is "numbers
                            issued", not "tickets currently in the project". */}
                        {project.ticket_seq}
                      </TableCell>
                      <TableCell className="text-right">
                        <EditProjectDialog project={project} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
