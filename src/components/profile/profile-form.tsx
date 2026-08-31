"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { TextField } from "@/components/forms/text-field";
import { updateProfile } from "@/app/(app)/profile/actions";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import {
  updateProfileSchema,
  type UpdateProfileInput,
  type UpdateProfileValues,
} from "@/lib/validations/profile";
import type { Profile } from "@/types/app";

export function ProfileForm({ profile }: { profile: Profile }) {
  // Three generics: field values, context, and the post-transform submit values.
  // The schema turns an empty avatarUrl into null, so those two differ.
  const form = useForm<UpdateProfileInput, unknown, UpdateProfileValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      fullName: profile.full_name ?? "",
      avatarUrl: profile.avatar_url ?? "",
    },
  });

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isSubmitting, isDirty },
  } = form;

  async function onSubmit(values: UpdateProfileValues) {
    const result = await updateProfile(values);

    if (!result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
      return;
    }

    // Re-baseline so the form is no longer dirty and the button disables again.
    // Back to input shape: the null avatarUrl has to become "" for the input.
    reset({
      fullName: values.fullName,
      avatarUrl: values.avatarUrl ?? "",
    });
    toast.success("Profile updated.");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <TextField
          control={control}
          name="fullName"
          label="Full name"
          autoComplete="name"
        />
        <TextField
          control={control}
          name="avatarUrl"
          label="Avatar URL"
          type="url"
          autoComplete="photo"
          placeholder="https://example.com/avatar.png"
          description="Optional. Leave blank to use your initials."
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
