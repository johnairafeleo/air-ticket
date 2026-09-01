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
import { PasswordField } from "@/components/forms/password-field";
import { register } from "@/app/(auth)/actions";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";

export function RegisterForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(values: RegisterInput) {
    const result = await register(values);

    if (!result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
      return;
    }

    setSentTo(values.email);
  }

  if (sentTo) {
    return (
      <Alert>
        <MailCheck aria-hidden />
        <AlertTitle>Check your inbox</AlertTitle>
        <AlertDescription>
          <p>
            We sent a confirmation link to <strong>{sentTo}</strong>. Click it to
            activate your account, then sign in.
          </p>
          <p className="text-muted-foreground">
            The link expires in 24 hours. If it does not arrive, check your spam
            folder.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <TextField
          control={control}
          name="fullName"
          label="Full name"
          autoComplete="name"
          autoFocus
          placeholder="Ada Lovelace"
        />
        <TextField
          control={control}
          name="email"
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
        />
        <PasswordField
          control={control}
          name="password"
          label="Password"
          autoComplete="new-password"
          description="At least 10 characters, with upper and lower case letters and a number."
        />
        <PasswordField
          control={control}
          name="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </FieldGroup>
    </form>
  );
}
