import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

export const metadata: Metadata = {
  title: "Verify your email",
};

export default async function VerifyEmailPage(
  props: PageProps<"/verify-email">,
) {
  const { email } = await props.searchParams;
  const defaultEmail = typeof email === "string" ? email : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>
          You need to confirm your address before you can sign in. Lost the
          email? Request another one.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ResendVerificationForm defaultEmail={defaultEmail} />
      </CardContent>

      <CardFooter className="justify-center">
        <Link
          href="/login"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
