import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/layout/page-header";
import { RoleBadge } from "@/components/layout/role-badge";
import { ProfileForm } from "@/components/profile/profile-form";
import { requireUser } from "@/lib/auth/require-user";

export const metadata: Metadata = {
  title: "Profile",
};

export default async function ProfilePage() {
  const { profile } = await requireUser("/profile");

  return (
    <>
      <PageHeader
        title="Profile"
        description="Manage how you appear to other people in the support desk."
      />

      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>
              These are visible to agents and administrators handling your
              tickets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profile} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Only an administrator can change these.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{profile.email}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Role</span>
              <RoleBadge role={profile.role} />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Member since</span>
              <span className="font-medium">
                {new Date(profile.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
