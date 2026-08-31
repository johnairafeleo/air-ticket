import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { UserRole } from "@/types/app";

const VARIANTS: Record<UserRole, React.ComponentProps<typeof Badge>["variant"]> = {
  USER: "secondary",
  AGENT: "outline",
  ADMIN: "default",
};

export function RoleBadge({
  role,
  className,
}: {
  role: UserRole;
  className?: string;
}) {
  return (
    <Badge variant={VARIANTS[role]} className={className}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}
