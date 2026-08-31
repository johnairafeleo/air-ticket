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
import { RegisterForm } from "@/components/auth/register-form";
import { GoogleButton } from "@/components/auth/google-button";
import { isProviderEnabled } from "@/lib/auth/providers";
import { redirectIfAuthenticated } from "@/lib/auth/require-user";

export const metadata: Metadata = {
  title: "Create account",
};

export default async function RegisterPage() {
  await redirectIfAuthenticated();

  const googleEnabled = await isProviderEnabled("google");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          You will receive a confirmation email before you can sign in.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* Google signs up and signs in through the same flow — the account is
            created on first use. */}
        {googleEnabled ? (
          <>
            <GoogleButton />
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-2 text-xs uppercase tracking-wide text-muted-foreground">
                  or
                </span>
              </div>
            </div>
          </>
        ) : null}
        <RegisterForm />
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
