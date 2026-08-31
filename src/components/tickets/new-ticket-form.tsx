"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldError,
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
import {
  TICKET_PRIORITIES,
  type Category,
  type Project,
  type TicketStatus,
} from "@/types/app";

const PRIORITY_HINTS: Record<string, string> = {
  LOW: "Minor inconvenience, no deadline.",
  MEDIUM: "Normal work impact.",
  HIGH: "Blocking your work, or affecting several people.",
  URGENT: "Critical outage or a whole team is blocked.",
};

/** Matches the label styling of the ticket controls rail. */
const RAIL_LABEL = "text-xs uppercase tracking-wide text-muted-foreground";

/**
 * Raise a ticket.
 *
 * Laid out like the ticket detail view — the writing on the left, the settings
 * in a right-hand rail — so creating and editing a ticket read as the same
 * screen rather than two unrelated forms.
 */
export function NewTicketForm({
  categories,
  projects,
  defaultProjectId,
  canSchedule = false,
  defaultStatus,
  onCreated,
  onCancel,
}: {
  categories: Category[];
  projects: Project[];
  /**
   * Whether to offer the planning dates. Staff only — guard_ticket_insert()
   * nulls them for USER callers, so showing the fields would be a lie.
   */
  canSchedule?: boolean;
  /**
   * Board column to create into. Not a visible field — the column you clicked
   * "+" in already said it, and the insert guard ignores it for requesters.
   */
  defaultStatus?: TicketStatus;
  /** The switcher's current project, so the common case needs no extra click. */
  defaultProjectId?: string;
  /**
   * Called after a successful create. When omitted — the standalone
   * /tickets/new page — the form navigates to the new ticket itself.
   */
  onCreated?: (ticket: { id: string; ticketNumber: string }) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();

  const form = useForm<CreateTicketInput, unknown, CreateTicketValues>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      projectId: defaultProjectId ?? projects[0]?.id ?? "",
      title: "",
      description: "",
      categoryId: "",
      priority: "MEDIUM",
      startDate: "",
      endDate: "",
      status: defaultStatus,
    },
  });

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = form;

  async function onSubmit(values: CreateTicketValues) {
    const result = await createTicket(values);

    if (!result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
      return;
    }

    // The caller owns the success message: the dialog adds a "View" action,
    // while the standalone page navigates instead. Toasting here too would
    // show two.
    if (onCreated) {
      onCreated(result.data);
      return;
    }

    toast.success(`${result.data.ticketNumber} created.`);
    router.push(`/tickets/${result.data.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_270px]">
        <div className="space-y-4">
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
                  // The shadcn Textarea sets field-sizing-content and min-h-16,
                  // which override the rows attribute — the floor is a class.
                  className="min-h-56"
                  placeholder="What happened, what you expected, and anything you have already tried."
                  aria-invalid={Boolean(fieldState.error)}
                />
                <FieldDescription>
                  Include error messages and steps to reproduce — it saves a
                  round trip.
                </FieldDescription>
                <FieldError
                  errors={fieldState.error ? [fieldState.error] : undefined}
                />
              </Field>
            )}
          />
        </div>

        <div className="space-y-3 md:border-l md:pl-6">
          <Controller
            control={control}
            name="projectId"
            render={({ field, fieldState }) => (
              <Field data-invalid={Boolean(fieldState.error)}>
                <FieldLabel htmlFor="projectId" className={RAIL_LABEL}>
                  Project
                </FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="projectId" className="w-full">
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {project.key}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Sets the ticket number, and cannot be changed later.
                </FieldDescription>
                <FieldError
                  errors={fieldState.error ? [fieldState.error] : undefined}
                />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="categoryId"
            render={({ field, fieldState }) => (
              <Field data-invalid={Boolean(fieldState.error)}>
                <FieldLabel htmlFor="categoryId" className={RAIL_LABEL}>
                  Category
                </FieldLabel>
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
                <FieldLabel htmlFor="priority" className={RAIL_LABEL}>
                  Priority
                </FieldLabel>
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
          {canSchedule ? (
            <div className="space-y-1.5 border-t pt-3">
              <FieldLabel className={RAIL_LABEL}>Schedule</FieldLabel>

              {/* Side by side: a date range reads as one thing. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <FieldLabel
                    htmlFor="new-start-date"
                    className="text-xs font-normal text-muted-foreground"
                  >
                    Start
                  </FieldLabel>
                  <Input
                    id="new-start-date"
                    type="date"
                    className="px-2"
                    {...register("startDate")}
                    aria-invalid={Boolean(errors.startDate)}
                  />
                </div>

                <div className="space-y-1">
                  <FieldLabel
                    htmlFor="new-end-date"
                    className="text-xs font-normal text-muted-foreground"
                  >
                    End
                  </FieldLabel>
                  <Input
                    id="new-end-date"
                    type="date"
                    className="px-2"
                    {...register("endDate")}
                    aria-invalid={Boolean(errors.endDate)}
                  />
                </div>
              </div>

              {/* One slot: the range error belongs to the pair. */}
              <FieldError
                errors={
                  errors.endDate ?? errors.startDate
                    ? [errors.endDate ?? errors.startDate]
                    : undefined
                }
              />
              <FieldDescription>Optional planning dates.</FieldDescription>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t pt-4">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        ) : null}
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
    </form>
  );
}
