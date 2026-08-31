import Link from "next/link";
import { FolderKanban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown wherever a project is required but the caller belongs to none.
 *
 * Every view is scoped to exactly one project, so with none there is genuinely
 * nothing to display — an empty table or a dashboard of zeroes would read as a
 * fault rather than a setup step.
 *
 * Since 0011 any signed-in user may create a project and becomes its manager,
 * so this always offers the action. It previously asked whether the viewer was
 * a system admin, which stopped being the right question when creation opened
 * up, and left new accounts told to "ask an administrator" for something they
 * could do themselves.
 */
export function NoProjects() {
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
            project&apos;s key. Create one and you&apos;ll be its manager — you
            can invite people and set what they can do.
          </p>
        </div>

        <Button asChild size="sm">
          <Link href="/admin/projects">Create a project</Link>
        </Button>

        <p className="text-xs text-muted-foreground">
          Or ask a colleague to add you to theirs.
        </p>
      </CardContent>
    </Card>
  );
}
