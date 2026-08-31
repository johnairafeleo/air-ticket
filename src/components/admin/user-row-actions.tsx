"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, MoreHorizontal, ShieldCheck, UserMinus, UserPlus } from "lucide-react";

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
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { setUserActive, updateUserRole } from "@/app/(app)/admin/users/actions";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { USER_ROLES, type Profile, type UserRole } from "@/types/app";

const ROLE_HINTS: Record<UserRole, string> = {
  USER: "Can raise tickets and comment on their own.",
  AGENT: "Can work the queue, update status and resolve tickets.",
  ADMIN: "Full access, including user and role management.",
};

export function UserRowActions({
  user,
  isSelf,
}: {
  user: Profile;
  isSelf: boolean;
}) {
  const [roleOpen, setRoleOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [nextRole, setNextRole] = useState<UserRole>(user.role);
  const [pending, startTransition] = useTransition();

  // An admin editing their own role or activation is refused by the server and
  // by the database. Disabling it here just avoids offering a dead action.
  if (isSelf) {
    return (
      <span className="text-xs text-muted-foreground">
        You cannot change your own access
      </span>
    );
  }

  function submitRole() {
    startTransition(async () => {
      const result = await updateUserRole({ userId: user.id, role: nextRole });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setRoleOpen(false);
      toast.success(
        `${user.full_name ?? user.email} is now ${ROLE_LABELS[nextRole]}.`,
      );
    });
  }

  function submitActive(isActive: boolean) {
    startTransition(async () => {
      const result = await setUserActive({ userId: user.id, isActive });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setDeactivateOpen(false);
      toast.success(
        isActive
          ? `${user.full_name ?? user.email} can sign in again.`
          : `${user.full_name ?? user.email} has been deactivated.`,
      );
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <MoreHorizontal aria-hidden />
            )}
            <span className="sr-only">
              Actions for {user.full_name ?? user.email}
            </span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setNextRole(user.role);
              setRoleOpen(true);
            }}
          >
            <ShieldCheck aria-hidden />
            Change role
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {user.is_active ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeactivateOpen(true)}
            >
              <UserMinus aria-hidden />
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => submitActive(true)}>
              <UserPlus aria-hidden />
              Reactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              Choose the access level for{" "}
              <strong>{user.full_name ?? user.email}</strong>. This takes effect
              immediately, on their next request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="role-select">Role</Label>
            <Select
              value={nextRole}
              onValueChange={(value) => setNextRole(value as UserRole)}
            >
              <SelectTrigger id="role-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{ROLE_HINTS[nextRole]}</p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRoleOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={submitRole}
              disabled={pending || nextRole === user.role}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Change role"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Deactivate {user.full_name ?? user.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will be signed out on their next request and cannot sign in
              again until reactivated. Their tickets and history are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Keep the dialog open until the action resolves so a failure
                // can be shown rather than silently dismissed.
                event.preventDefault();
                submitActive(false);
              }}
              disabled={pending}
            >
              {pending ? "Deactivating…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
