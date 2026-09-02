"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { FieldGroup } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { TextField } from "@/components/forms/text-field";
import {
  addProjectMember,
  removeProjectMember,
  updateMemberRole,
} from "@/app/(app)/projects/member-actions";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import { addMemberSchema, type AddMemberInput } from "@/lib/validations/member";
import { initialsOf, displayName } from "@/lib/users";
import {
  PROJECT_ROLES,
  type ProjectMemberWithProfile,
  type ProjectRole,
} from "@/types/app";

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  VIEWER: "Viewer",
  MEMBER: "Member",
  AGENT: "Agent",
  MANAGER: "Manager",
};

const ROLE_HINTS: Record<ProjectRole, string> = {
  VIEWER: "Reads every ticket in the project. Changes nothing.",
  MEMBER: "Everything a manager does, except managing people.",
  AGENT: "Works the queue: status, priority, category, scheduling.",
  MANAGER: "Everything a member does, plus adding and removing people.",
};

/**
 * Project membership.
 *
 * Only rendered for managers and system admins. RLS enforces the same rule, so
 * this decides whether to offer the controls, not whether they work.
 */
export function MemberManager({
  projectId,
  members,
  currentUserId,
}: {
  projectId: string;
  members: ProjectMemberWithProfile[];
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);

  const form = useForm<AddMemberInput>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { projectId, email: "", role: "MEMBER" },
  });

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { isSubmitting },
  } = form;

  async function onAdd(values: AddMemberInput) {
    const result = await addProjectMember(values);

    if (!result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
      return;
    }

    reset({ projectId, email: "", role: "MEMBER" });
    setAddOpen(false);
    toast.success("Member added.");
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(msg);
    });
  }

  const managerCount = members.filter((m) => m.role === "MANAGER").length;

  return (
    <div className="space-y-4">
      {addOpen ? (
        <form
          onSubmit={handleSubmit(onAdd)}
          noValidate
          className="rounded-lg border p-4"
        >
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <TextField
                control={control}
                name="email"
                label="Email"
                type="email"
                autoFocus
                placeholder="colleague@company.com"
                description="They must already have an account."
              />

              <div className="space-y-1.5">
                <label
                  htmlFor="member-role"
                  className="text-sm font-medium leading-snug"
                >
                  Role
                </label>
                <Select
                  defaultValue="MEMBER"
                  onValueChange={(v) =>
                    setValue("role", v as ProjectRole, { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="member-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {PROJECT_ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Adding…
                  </>
                ) : (
                  "Add member"
                )}
              </Button>
            </div>
          </FieldGroup>
        </form>
      ) : (
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <UserPlus aria-hidden />
          Add member
        </Button>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead className="w-[200px]">Role</TableHead>
              <TableHead className="w-[80px] text-right">Remove</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {members.map((member) => {
              // The database refuses to remove the last manager; disabling the
              // control avoids offering an action that will be rejected.
              const isLastManager =
                member.role === "MANAGER" && managerCount <= 1;

              return (
                <TableRow key={member.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        {member.profile?.avatar_url ? (
                          <AvatarImage src={member.profile.avatar_url} alt="" />
                        ) : null}
                        <AvatarFallback className="text-xs">
                          {member.profile ? initialsOf(member.profile) : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {displayName(member.profile)}
                          {member.user_id === currentUserId ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              (you)
                            </span>
                          ) : null}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          {member.profile?.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Select
                      value={member.role}
                      disabled={pending || isLastManager}
                      onValueChange={(role) =>
                        run(
                          () =>
                            updateMemberRole({
                              projectId,
                              userId: member.user_id,
                              role,
                            }),
                          "Role updated.",
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {PROJECT_ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isLastManager ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        The only manager — promote someone else first.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {ROLE_HINTS[member.role]}
                      </p>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={pending || isLastManager}
                          aria-label={`Remove ${displayName(member.profile)}`}
                        >
                          <X aria-hidden />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Remove {displayName(member.profile)}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            They lose access to this project and its tickets.
                            Tickets they raised are kept.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e) => {
                              e.preventDefault();
                              run(
                                () =>
                                  removeProjectMember({
                                    projectId,
                                    userId: member.user_id,
                                  }),
                                "Member removed.",
                              );
                            }}
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {members.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No members yet.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {PROJECT_ROLES.map((r) => (
            <Badge key={r} variant="outline" className="font-normal">
              {PROJECT_ROLE_LABELS[r]}: {ROLE_HINTS[r]}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
