"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TextField } from "@/components/forms/text-field";
import { createTicket } from "@/app/(app)/tickets/actions";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import { PRIORITY_LABELS } from "@/lib/tickets/constants";
import {
  createTicketSchema,
  type CreateTicketInput,
  type CreateTicketValues,
} from "@/lib/validations/ticket";
import { TICKET_PRIORITIES, type Category } from "@/types/app";

const PRIORITY_HINTS: Record<string, string> = {
  LOW: "Minor inconvenience, no deadline.",
  MEDIUM: "Normal work impact.",
  HIGH: "Blocking your work, or affecting several people.",
  URGENT: "Critical outage or a whole team is blocked.",
};

export function NewTicketForm({ categories }: { categories: Category[] }) {
  const form = useForm<CreateTicketInput, unknown, CreateTicketValues>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      title: "",
      description: "",
      categoryId: "",
      priority: "MEDIUM",
    },
  });

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(values: CreateTicketValues) {
    // Redirects to the new ticket on success, so nothing after this runs then.
    const result = await createTicket(values);

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
          name="title"
          label="Title"
          autoFocus
          placeholder="Laptop won't connect to the VPN"
          description="One line summarising the problem."
        />

        <Controller
          control={control}
          name="description"
          render={({ field, fieldState }) => (
            <Field data-invalid={Boolean(fieldState.error)}>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea
                {...field}
                id="description"
                className="min-h-56"
                placeholder="What happened, what you expected, and anything you have already tried."
                aria-invalid={Boolean(fieldState.error)}
              />
              <FieldDescription>
                Include error messages and steps to reproduce — it saves a round trip.
              </FieldDescription>
              <FieldError
                errors={fieldState.error ? [fieldState.error] : undefined}
              />
            </Field>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="categoryId"
            render={({ field, fieldState }) => (
              <Field data-invalid={Boolean(fieldState.error)}>
                <FieldLabel htmlFor="categoryId">Category</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="categoryId" className="w-full">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError
                  errors={fieldState.error ? [fieldState.error] : undefined}
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="priority"
            render={({ field, fieldState }) => (
              <Field data-invalid={Boolean(fieldState.error)}>
                <FieldLabel htmlFor="priority">Priority</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Read from the Controller's own value rather than RHF's
                    watch(), which React Compiler cannot memoize. */}
                <FieldDescription>{PRIORITY_HINTS[field.value]}</FieldDescription>
                <FieldError
                  errors={fieldState.error ? [fieldState.error] : undefined}
                />
              </Field>
            )}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Creating…
              </>
            ) : (
              "Create ticket"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
