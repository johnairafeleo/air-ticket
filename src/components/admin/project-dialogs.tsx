"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { TextField } from "@/components/forms/text-field";
import { createProject, updateProject } from "@/app/(app)/projects/actions";
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "@/lib/validations/project";
import { applyServerErrors } from "@/lib/forms/apply-server-errors";
import type { Project } from "@/types/app";

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);

  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { key: "", name: "", description: "" },
  });

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(values: CreateProjectInput) {
    const result = await createProject(values);

    if (!result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
      return;
    }

    setOpen(false);
    reset({ key: "", name: "", description: "" });
    toast.success(`Project ${values.key} created.`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          New project
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            The key prefixes every ticket number in this project, so it cannot be
            changed afterwards.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <TextField
              control={control}
              name="key"
              label="Key"
              autoFocus
              placeholder="NET"
              description="2–10 characters, letters and digits. Tickets become NET-1, NET-2…"
            />
            <TextField
              control={control}
              name="name"
              label="Name"
              placeholder="Network Operations"
            />
            <TextField
              control={control}
              name="description"
              label="Description"
              placeholder="Optional"
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Creating…
                  </>
                ) : (
                  "Create project"
                )}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditProjectDialog({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);

  const form = useForm<UpdateProjectInput>({
    resolver: zodResolver(updateProjectSchema),
    defaultValues: {
      projectId: project.id,
      name: project.name,
      description: project.description ?? "",
      isActive: project.is_active,
    },
  });

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(values: UpdateProjectInput) {
    const result = await updateProject(values);

    if (!result.ok) {
      const message = applyServerErrors(result, setError);
      if (message) toast.error(message);
      return;
    }

    setOpen(false);
    toast.success("Project updated.");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil aria-hidden />
          Edit
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {project.key}</DialogTitle>
          <DialogDescription>
            The key is fixed — existing ticket numbers depend on it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <TextField control={control} name="name" label="Name" autoFocus />
            <TextField
              control={control}
              name="description"
              label="Description"
              placeholder="Optional"
            />

            {/* Controller rather than watch(): RHF's watch() cannot be memoized
                by React Compiler, which disables optimisation for the whole
                component. */}
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <input
                    id="project-active"
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    onBlur={field.onBlur}
                  />
                  <Label htmlFor="project-active" className="font-normal">
                    Active — inactive projects are hidden from pickers, but keep
                    their tickets
                  </Label>
                </div>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
