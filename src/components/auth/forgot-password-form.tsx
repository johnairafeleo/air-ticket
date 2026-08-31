"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TextField } from "@/components/forms/text-field";
import { requestPasswordReset } from "@/app/(auth)/actions";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/lib/validations/auth";

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(values: ForgotPasswordInput) {
    const result = await requestPasswordReset(values);

    if (!result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Alert>
        <MailCheck aria-hidden />
        <AlertTitle>Check your inbox</AlertTitle>
        <AlertDescription>
          {/* Deliberately unconditional: confirming whether an account exists
              would let anyone test which addresses are registered. */}
          If an account exists for that address, we have sent a link to reset the
          password. The link expires in one hour.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <TextField
          control={control}
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="you@company.com"
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </Button>
      </FieldGroup>
    </form>
  );
}
