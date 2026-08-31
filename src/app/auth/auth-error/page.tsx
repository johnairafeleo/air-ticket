import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Link problem",
};

const REASONS: Record<string, { title: string; description: string }> = {
  invalid_link: {
    title: "This link is not valid",
    description:
      "The address is missing information we need. Make sure you opened the full link from the email — some clients truncate long URLs.",
  },
  expired_link: {
    title: "This link has expired",
    description:
      "Confirmation and reset links can only be used once, and expire after a short time. Request a new one to continue.",
  },
};

const FALLBACK = {
  title: "We could not complete that",
  description:
    "Something went wrong following that link. Request a new one and try again.",
};

export default async function AuthErrorPage(
  props: PageProps<"/auth/auth-error">,
) {
  const { reason } = await props.searchParams;
  const key = typeof reason === "string" ? reason : "";
  const { title, description } = REASONS[key] ?? FALLBACK;

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Link problem</CardTitle>
        </CardHeader>

        <CardContent>
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{description}</AlertDescription>
          </Alert>
        </CardContent>

        <CardFooter className="flex-col gap-2">
          <Button asChild className="w-full">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
