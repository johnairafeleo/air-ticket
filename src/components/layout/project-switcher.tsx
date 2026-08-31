"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, ChevronsUpDown, FolderKanban, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setActiveProject } from "@/app/(app)/projects/actions";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/app";

/**
 * Chooses which project scopes Tickets, Board and Dashboard.
 *
 * The selection lives in a cookie set by the server action, so it persists
 * across routes without every link carrying a query parameter. There is no
 * "all projects" option: every view describes exactly one project.
 */
export function ProjectSwitcher({
  projects,
  activeId,
}: {
  projects: Project[];
  /** Null only when no projects exist yet. */
  activeId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  const active = projects.find((p) => p.id === activeId) ?? null;

  function choose(projectId: string) {
    if (projectId === activeId) return;

    startTransition(async () => {
      const result = await setActiveProject({ projectId });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between gap-2 px-2"
          disabled={pending}
        >
          <span className="flex min-w-0 items-center gap-2">
            {pending ? (
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <FolderKanban className="size-4 shrink-0" aria-hidden />
            )}
            <span className="truncate text-sm">
              {active ? active.name : "No project"}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Project
        </DropdownMenuLabel>

        {projects.length === 0 ? (
          <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
        ) : null}

        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onSelect={() => choose(project.id)}
          >
            <Check
              className={cn(
                "size-4",
                activeId === project.id ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {project.key}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
