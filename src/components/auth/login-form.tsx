"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { TextField } from "@/components/forms/text-field";
import { login } from "@/app/(auth)/actions";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

export function LoginForm({ next }: { next?: string }) {
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(values: LoginInput) {
    // On success `login` redirects, which throws — so nothing after this line
    // runs in the happy path.
    const result = await login(values, next);

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
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="you@company.com"
        />

        <div className="space-y-2">
          <TextField
            control={control}
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
          />
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </FieldGroup>
    </form>
  );
}
