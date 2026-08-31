import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { TicketBoard } from "@/components/tickets/ticket-board";
import { ViewToggle } from "@/components/tickets/view-toggle";
import { requireRole } from "@/lib/auth/require-user";
import {
  listAssignableAgents,
  listBoardTickets,
  listCategories,
} from "@/lib/tickets/queries";

export const metadata: Metadata = {
  title: "Board",
};

export default async function TicketBoardPage() {
  // The real gate. A USER reaching this URL directly is redirected server-side,
  // before anything renders — the hidden nav item is not the protection.
  const { profile } = await requireRole("AGENT");

  const [board, agents, categories] = await Promise.all([
    listBoardTickets(),
    listAssignableAgents(),
    listCategories(),
  ]);

  return (
    <>
      <PageHeader
        title="Board"
        description="Drag a ticket to change its status."
        actions={
          <>
            <ViewToggle />
            <Button asChild>
              <Link href="/tickets/new">
                <Plus aria-hidden />
                New ticket
              </Link>
            </Button>
          </>
        }
      />

      <TicketBoard
        initial={board}
        actor={profile}
        agents={agents}
        categories={categories}
      />
    </>
  );
}
