import Link from "next/link";
import { TicketCheck } from "lucide-react";

import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import type { NavSection } from "@/components/layout/nav-items";
import type { Project } from "@/types/app";

/** Fixed sidebar. Hidden below `lg`, where the topbar's sheet takes over. */
export function AppSidebar({
  sections,
  projects,
  activeProjectId,
}: {
  sections: NavSection[];
  projects: Project[];
  activeProjectId: string | null;
}) {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-card lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <TicketCheck className="size-4" aria-hidden />
          </span>
          <span>Air Ticket</span>
        </Link>
      </div>

      <div className="border-b px-3 py-3">
        <ProjectSwitcher projects={projects} activeId={activeProjectId} />
      </div>

      <SidebarNav sections={sections} />
    </aside>
  );
}
