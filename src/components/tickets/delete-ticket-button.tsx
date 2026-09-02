"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteTicket } from "@/app/(app)/tickets/actions";

/**
 * Delete a ticket, behind a confirmation.
 *
 * Only rendered when `canDeleteTicket()` says so, which mirrors the
 * `tickets_delete` policy — but the policy is what actually decides. A refused
 * delete removes zero rows rather than erroring, so the action counts them and
 * reports the refusal; this component just relays that.
 *
 * `redirectTo` exists because the caller knows where it is. Deleting from the
 * ticket's own page has to navigate away — the page it is on no longer exists —
 * while deleting from a list or board should stay put and let revalidation drop
 * the row.
 */
export function DeleteTicketButton({
  ticketId,
  ticketNumber,
  redirectTo,
}: {
  ticketId: string;
  ticketNumber: string;
  /** Where to go afterwards. Omit to stay on the current page. */
  redirectTo?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirm() {
    startTransition(async () => {
      const result = await deleteTicket({ ticketId });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(`${ticketNumber} deleted.`);
      if (redirectTo) router.push(redirectTo);
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          className="text-destructive hover:text-destructive"
        >
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Trash2 aria-hidden />
          )}
          Delete
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {ticketNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            {ticketNumber} disappears from every list, board and dashboard
            count. The ticket itself is kept and an administrator can restore
            it from the database.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Without this the dialog closes before the transition finishes,
              // discarding the pending state the button renders.
              e.preventDefault();
              confirm();
            }}
          >
            Delete ticket
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
