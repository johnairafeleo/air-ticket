"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  NewTicketForm,
  type TicketAssigning,
} from "@/components/tickets/new-ticket-form";
import { STATUS_LABELS } from "@/lib/tickets/constants";
import type { Category, Project, TicketStatus } from "@/types/app";

/**
 * Raise a ticket without leaving the page.
 *
 * Same surface and proportions as the ticket detail modal, so creating and
 * viewing a ticket feel like one screen.
 *
 * Deliberately does NOT navigate on success: you raised this from a board or a
 * filtered list and almost always want to carry on there. Revalidation puts the
 * new ticket in its column, and the toast carries a "View" action for the times
 * you do want to open it.
 */
export function NewTicketDialog({
  categories,
  projects,
  defaultProjectId,
  canSchedule = false,
  assigning,
  defaultStatus,
  trigger,
}: {
  categories: Category[];
  projects: Project[];
  defaultProjectId?: string;
  canSchedule?: boolean;
  /** Offers the assignee picker. See TicketAssigning. */
  assigning?: TicketAssigning;
  /** Board column to create into. */
  defaultStatus?: TicketStatus;
  /** Replaces the default button — the board columns pass a compact "+". */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus aria-hidden />
            New ticket
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            New ticket
            {defaultStatus ? ` in ${STATUS_LABELS[defaultStatus]}` : ""}
          </DialogTitle>
          <DialogDescription>
            Tell us what&apos;s wrong and we&apos;ll pick it up.
          </DialogDescription>
        </DialogHeader>

        {/*
          `key` remounts the form each time the dialog opens, clearing anything
          typed and abandoned on a previous open.
        */}
        <NewTicketForm
          key={open ? "open" : "closed"}
          categories={categories}
          projects={projects}
          defaultProjectId={defaultProjectId}
          canSchedule={canSchedule}
          assigning={assigning}
          defaultStatus={defaultStatus}
          onCancel={() => setOpen(false)}
          onCreated={({ id, ticketNumber }) => {
            setOpen(false);
            // Stay put. The action already revalidated the board and the list,
            // so the card appears behind the closing dialog.
            toast.success(`${ticketNumber} created.`, {
              action: {
                label: "View",
                onClick: () => router.push(`/tickets/${id}`),
              },
            });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
