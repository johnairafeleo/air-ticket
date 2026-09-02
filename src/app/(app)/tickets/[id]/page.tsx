import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/page-header";
import { initialsOf } from "@/lib/users";
import { PriorityBadge, StatusBadge } from "@/components/tickets/ticket-badges";
import { TicketControls } from "@/components/tickets/ticket-controls";
import { EditTicketDialog } from "@/components/tickets/edit-ticket-dialog";
import { DeleteTicketButton } from "@/components/tickets/delete-ticket-button";
import {
  canDeleteTicket,
  canEditTicketDetails,
} from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/require-user";
import { getTicket, listCategories } from "@/lib/tickets/queries";
import {
  getTicketActor,
  isProjectStaff,
  listAssignableMembers,
} from "@/lib/projects/access";

export async function generateMetadata(
  props: PageProps<"/tickets/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const ticket = await getTicket(id);
  return { title: ticket ? `${ticket.ticket_number} · ${ticket.title}` : "Ticket" };
}

export default async function TicketDetailPage(
  props: PageProps<"/tickets/[id]">,
) {
  const { id } = await props.params;
  const { profile } = await requireUser(`/tickets/${id}`);

  // getTicket runs under RLS, so a ticket this user may not see comes back null
  // and renders as 404 — identical to one that does not exist, which avoids
  // confirming that a given ticket id is real.
  const ticket = await getTicket(id);
  if (!ticket) notFound();

  // Permissions come from the caller's role in THIS ticket's project.
  const actor = await getTicketActor(profile, ticket.project_id);

  const [agents, categories] = isProjectStaff(actor)
    ? await Promise.all([
        listAssignableMembers(ticket.project_id),
        listCategories(),
      ])
    : [[], []];

  const isOwner = ticket.created_by === profile.id;
  const canEdit = canEditTicketDetails(actor);
  const canDelete = canDeleteTicket(actor, ticket);

  return (
    <>
      <PageHeader
        title={ticket.title}
        description={`${ticket.ticket_number} · raised ${formatDistanceToNow(
          new Date(ticket.created_at),
          { addSuffix: true },
        )}`}
        actions={
          <>
            {canDelete ? (
              <DeleteTicketButton
                ticketId={ticket.id}
                ticketNumber={ticket.ticket_number}
                // This page is about to stop existing, so it cannot stay put.
                redirectTo="/tickets"
              />
            ) : null}
            <Button variant="outline" asChild>
              <Link href="/tickets">
                <ArrowLeft aria-hidden />
                Back
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
                {ticket.category ? (
                  <span className="text-sm text-muted-foreground">
                    in {ticket.category.name}
                  </span>
                ) : null}

                <div className="ml-auto">
                  {canEdit ? (
                    <EditTicketDialog ticket={ticket} />
                  ) : (
                    // Say why rather than silently omitting the button — the
                    // rule is a real workflow constraint, not an oversight.
                    <span className="text-xs text-muted-foreground">
                      {isOwner
                        ? "Can no longer be edited — work has started"
                        : "Only support staff can edit this"}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {/* whitespace-pre-wrap preserves the reporter's line breaks
                  without rendering their input as HTML. */}
              {ticket.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {ticket.description}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No description was given.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversation</CardTitle>
              <CardDescription>
                Comments, attachments and the full audit history arrive in Phase 3.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                Not available yet.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manage</CardTitle>
            </CardHeader>
            <CardContent>
              <TicketControls
                ticket={ticket}
                actor={actor}
                agents={agents}
                categories={categories}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Raised by</p>
                <div className="flex items-center gap-2">
                  <Avatar className="size-6">
                    {ticket.creator?.avatar_url ? (
                      <AvatarImage src={ticket.creator.avatar_url} alt="" />
                    ) : null}
                    <AvatarFallback className="text-[10px]">
                      {ticket.creator
                        ? initialsOf(ticket.creator)
                        : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span>
                    {ticket.creator?.full_name ?? ticket.creator?.email ?? "Unknown"}
                  </span>
                </div>
              </div>

              <Separator />

              {ticket.start_date ? (
                <Row label="Planned start">
                  {format(new Date(ticket.start_date), "d MMM yyyy")}
                </Row>
              ) : null}
              {ticket.end_date ? (
                <Row label="Planned end">
                  {format(new Date(ticket.end_date), "d MMM yyyy")}
                </Row>
              ) : null}

              <Row label="Created">
                {format(new Date(ticket.created_at), "d MMM yyyy, HH:mm")}
              </Row>
              <Row label="Last updated">
                {format(new Date(ticket.updated_at), "d MMM yyyy, HH:mm")}
              </Row>
              {ticket.resolved_at ? (
                <Row label="Resolved">
                  {format(new Date(ticket.resolved_at), "d MMM yyyy, HH:mm")}
                </Row>
              ) : null}
              {ticket.closed_at ? (
                <Row label="Closed">
                  {format(new Date(ticket.closed_at), "d MMM yyyy, HH:mm")}
                </Row>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
