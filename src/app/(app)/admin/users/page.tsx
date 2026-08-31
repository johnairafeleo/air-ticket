import type { Metadata } from "next";
import { Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { RoleBadge } from "@/components/layout/role-badge";
import { initialsOf } from "@/lib/users";
import { UserRowActions } from "@/components/admin/user-row-actions";
import { requireRole } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Users",
};

export default async function AdminUsersPage() {
  // The real gate. A USER hitting this URL directly is redirected here, on the
  // server, before anything renders — the hidden nav item is not what stops them.
  const { profile: actor } = await requireRole("ADMIN");

  const supabase = await createClient();
  const { data: users, error } = await supabase
    .from("profiles")
    .select("*")
    .order("role", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <>
        <PageHeader title="Users" />
        <Alert variant="destructive">
          <AlertTitle>Could not load users</AlertTitle>
          <AlertDescription>
            {/* Deliberately not echoing error.message — it can leak schema detail. */}
            Something went wrong reading the user list. Refresh to try again.
          </AlertDescription>
        </Alert>
      </>
    );
  }

  const rows = users ?? [];
  const activeAdmins = rows.filter((u) => u.role === "ADMIN" && u.is_active).length;

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage who can access the support desk and what they can do."
      />

      {activeAdmins <= 1 ? (
        <Alert className="mb-6">
          <AlertTitle>You are the only active administrator</AlertTitle>
          <AlertDescription>
            The database will refuse to demote or deactivate the last one.
            Promote a second administrator so you are not locked out.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" aria-hidden />
            All users
          </CardTitle>
          <CardDescription>
            {rows.length} {rows.length === 1 ? "account" : "accounts"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No users yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rows.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            {user.avatar_url ? (
                              <AvatarImage src={user.avatar_url} alt="" />
                            ) : null}
                            <AvatarFallback className="text-xs">
                              {initialsOf(user)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {user.full_name ?? "Unnamed user"}
                              {user.id === actor.id ? (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  (you)
                                </span>
                              ) : null}
                            </div>
                            <div className="truncate text-sm text-muted-foreground">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <RoleBadge role={user.role} />
                      </TableCell>

                      <TableCell>
                        {user.is_active ? (
                          <Badge variant="outline">Active</Badge>
                        ) : (
                          <Badge variant="destructive">Deactivated</Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>

                      <TableCell className="text-right">
                        <UserRowActions
                          user={user}
                          isSelf={user.id === actor.id}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
