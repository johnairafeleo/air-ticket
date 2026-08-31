import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a new password",
};

export default async function ResetPasswordPage() {
  // Reaching this page requires the recovery session that /auth/confirm
  // established. Checking here means someone who opens the URL directly, or
  // whose link has expired, gets a clear explanation instead of a form that
  // fails on submit.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link expired</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertTitle>This reset link is no longer valid</AlertTitle>
            <AlertDescription>
              Password reset links can only be used once and expire after an
              hour. Request a new one to continue.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          Setting a new password for <strong>{user.email}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
