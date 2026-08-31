import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { NewTicketForm } from "@/components/tickets/new-ticket-form";
import { requireUser } from "@/lib/auth/require-user";
import { listCategories } from "@/lib/tickets/queries";

export const metadata: Metadata = {
  title: "New ticket",
};

export default async function NewTicketPage() {
  await requireUser("/tickets/new");
  const categories = await listCategories();

  return (
    <>
      <PageHeader
        title="New ticket"
        description="Tell us what's wrong and we'll pick it up."
        actions={
          <Button variant="outline" asChild>
            <Link href="/tickets">
              <ArrowLeft aria-hidden />
              Back to tickets
            </Link>
          </Button>
        }
      />

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Ticket details</CardTitle>
          <CardDescription>
            You&apos;ll be able to follow progress and add comments once it&apos;s
            raised.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewTicketForm categories={categories} />
        </CardContent>
      </Card>
    </>
  );
}
