import { requireUser } from "@/lib/auth/require-user";
import { getActiveProjectId, listProjects } from "@/lib/projects/active";
import { getTicketActor, isProjectStaff } from "@/lib/projects/access";
import { navSectionsFor } from "@/components/layout/nav-items";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";

/**
 * Shell for the authenticated area.
 *
 * `requireUser()` here is for *rendering* — it supplies the profile the sidebar
 * and topbar need, and gives signed-out visitors a redirect instead of a broken
 * shell. It is deliberately not the security boundary: in the App Router a
 * layout does not re-render on navigation and cannot prevent a child segment or
 * a Server Function from running. Every page below calls `requireUser()` or
 * `requireRole()` itself, and RLS backstops both.
 *
 * The repeated calls are cheap — `getSession()` is wrapped in React `cache()`,
 * so a render pass makes one round trip regardless of how many callers there are.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireUser();

  const [projects, activeProjectId] = await Promise.all([
    listProjects(),
    getActiveProjectId(),
  ]);

  // Nav visibility follows the caller's role in the active project.
  const staff = activeProjectId
    ? isProjectStaff(await getTicketActor(profile, activeProjectId))
    : false;

  const sections = navSectionsFor(profile, staff);

  return (
    <div className="flex min-h-svh">
      <AppSidebar
        sections={sections}
        projects={projects}
        activeProjectId={activeProjectId}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar profile={profile} sections={sections} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
