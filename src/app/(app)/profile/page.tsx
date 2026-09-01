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
import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { hasPasswordIdentity, requireUser } from "@/lib/auth/require-user";

export const metadata: Metadata = {
  title: "Profile",
};

export default async function ProfilePage() {
  const { user, profile } = await requireUser("/profile");

  // A Google-only account has no password to change; showing the form would
  // only fail at re-authentication with a confusing message.
  const canChangePassword = hasPasswordIdentity(user);

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

        {canChangePassword ? (
          <Card>
            <CardHeader>
              <CardTitle>Password</CardTitle>
              <CardDescription>
                Changing your password requires your current one. You stay
                signed in on this device.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Password</CardTitle>
              <CardDescription>
                You sign in with Google, so this account has no password to
                change. Manage it in your Google account instead.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

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
