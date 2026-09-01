"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { PasswordField } from "@/components/forms/password-field";
import { changePassword } from "@/app/(app)/profile/actions";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validations/auth";

const EMPTY: ChangePasswordInput = {
  currentPassword: "",
  password: "",
  confirmPassword: "",
};

export function ChangePasswordForm() {
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY,
  });

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(values: ChangePasswordInput) {
    const result = await changePassword(values);

    if (!result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
      return;
    }

    // Never leave passwords sitting in the form after a successful change.
    reset(EMPTY);
    toast.success("Password updated.");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <PasswordField
          control={control}
          name="currentPassword"
          label="Current password"
          noAutofill
          description="Type this in. It is deliberately not filled in for you."
        />
        <PasswordField
          control={control}
          name="password"
          label="New password"
          autoComplete="new-password"
          description="At least 10 characters, with upper and lower case letters and a number."
        />
        <PasswordField
          control={control}
          name="confirmPassword"
          label="Confirm new password"
          autoComplete="new-password"
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Updating…
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
