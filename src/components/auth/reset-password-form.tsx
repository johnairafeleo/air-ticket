"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { TextField } from "@/components/forms/text-field";
import { resetPassword } from "@/app/(auth)/actions";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/validations/auth";

export function ResetPasswordForm() {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(values: ResetPasswordInput) {
    // Redirects to /dashboard on success, so nothing after this runs then.
    const result = await resetPassword(values);

    if (result && !result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <TextField
          control={control}
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
          description="At least 10 characters, with upper and lower case letters and a number."
        />
        <TextField
          control={control}
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Updating password…
            </>
          ) : (
            "Update password"
          )}
        </Button>
      </FieldGroup>
    </form>
  );
}
