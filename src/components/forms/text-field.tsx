"use client";

import { useId } from "react";
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * `TTransformed` mirrors React Hook Form's third generic. Forms whose schema
 * transforms values (so input and output types differ) produce a three-generic
 * `Control`, and a two-generic prop type would reject it.
 */
type TextFieldProps<
  TValues extends FieldValues,
  TContext,
  TTransformed extends FieldValues,
> = {
  control: Control<TValues, TContext, TTransformed>;
  name: FieldPath<TValues>;
  label: string;
  description?: string;
} & Omit<React.ComponentProps<typeof Input>, "name" | "id" | "form">;

/**
 * A labelled text input bound to React Hook Form.
 *
 * Wraps the field/label/error wiring — including the accessibility attributes
 * that are easy to forget — so each form only declares what is specific to it.
 */
export function TextField<
  TValues extends FieldValues,
  TContext,
  TTransformed extends FieldValues,
>({
  control,
  name,
  label,
  description,
  ...inputProps
}: TextFieldProps<TValues, TContext, TTransformed>) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const { field, fieldState } = useController({ control, name });
  const invalid = Boolean(fieldState.error);

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...inputProps}
        {...field}
        id={id}
        // RHF holds `null` for cleared optional values; React needs a string to
        // keep the input controlled.
        value={field.value ?? ""}
        aria-invalid={invalid}
        aria-describedby={description ? descriptionId : undefined}
      />
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
    </Field>
  );
}
