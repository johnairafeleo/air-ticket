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
import { resendVerification } from "@/app/(auth)/actions";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import {
  resendVerificationSchema,
  type ResendVerificationInput,
} from "@/lib/validations/auth";

export function ResendVerificationForm({
  defaultEmail = "",
}: {
  defaultEmail?: string;
}) {
  const [sent, setSent] = useState(false);

  const form = useForm<ResendVerificationInput>({
    resolver: zodResolver(resendVerificationSchema),
    defaultValues: { email: defaultEmail },
  });

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(values: ResendVerificationInput) {
    const result = await resendVerification(values);

    if (!result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <Alert>
        <MailCheck aria-hidden />
        <AlertTitle>Confirmation email sent</AlertTitle>
        <AlertDescription>
          If that address has an unconfirmed account, a new link is on its way.
          It expires in 24 hours.
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
            "Resend confirmation email"
          )}
        </Button>
      </FieldGroup>
    </form>
  );
}
