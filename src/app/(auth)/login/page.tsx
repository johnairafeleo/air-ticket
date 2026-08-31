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
import { LoginForm } from "@/components/auth/login-form";
import { GoogleButton } from "@/components/auth/google-button";
import { isProviderEnabled } from "@/lib/auth/providers";
import { redirectIfAuthenticated } from "@/lib/auth/require-user";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage(props: PageProps<"/login">) {
  await redirectIfAuthenticated();

  // searchParams is a Promise in Next.js 16.
  const { next } = await props.searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  const googleEnabled = await isProviderEnabled("google");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Enter your credentials to access the support desk.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {googleEnabled ? (
          <>
            <GoogleButton next={nextPath} />
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
        <LoginForm next={nextPath} />
      </CardContent>

      <CardFooter className="flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
        <p className="text-sm text-muted-foreground">
          Never received your confirmation email?{" "}
          <Link
            href="/verify-email"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Resend it
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
