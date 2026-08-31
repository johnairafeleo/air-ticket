import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { RoleBadge } from "@/components/layout/role-badge";
import type { NavSection } from "@/components/layout/nav-items";
import type { Profile } from "@/types/app";

export function AppTopbar({
  profile,
  sections,
}: {
  profile: Profile;
  sections: NavSection[];
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-6">
      <MobileNav sections={sections} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-muted-foreground">
          Signed in as{" "}
          <span className="font-medium text-foreground">
            {profile.full_name ?? profile.email}
          </span>
        </p>
      </div>

      <RoleBadge role={profile.role} className="hidden sm:inline-flex" />
      <UserMenu profile={profile} />
    </header>
  );
}
