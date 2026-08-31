import Link from "next/link";
import { FolderKanban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown wherever a project is required but none exists.
 *
 * Every view is scoped to exactly one project, so with none created there is
 * genuinely nothing to display — an empty table or a dashboard of zeroes would
 * read as a fault rather than a setup step.
 */
export function NoProjects({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <FolderKanban className="size-5 text-muted-foreground" aria-hidden />
        </div>

        <div>
          <p className="font-medium">No projects yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Tickets belong to a project, and their numbers come from the
            project&apos;s key. Create one to get started.
          </p>
        </div>

        {isAdmin ? (
          <Button asChild size="sm">
            <Link href="/admin/projects">Create a project</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask an administrator to create one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
