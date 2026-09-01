"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * A password input with a show/hide toggle.
 *
 * Deliberately a sibling of `TextField` rather than a `type` on it: the reveal
 * state has to own the input's `type`, so a caller passing `type` would fight
 * it. Same three generics as TextField, for forms whose schema transforms
 * values and so produces a three-generic `Control`.
 */
type PasswordFieldProps<
  TValues extends FieldValues,
  TContext,
  TTransformed extends FieldValues,
> = {
  control: Control<TValues, TContext, TTransformed>;
  name: FieldPath<TValues>;
  label: string;
  description?: string;
  /**
   * Refuse browser and password-manager pre-filling, so the value has to be
   * typed. Set this on re-authentication fields — a "confirm your current
   * password" box that the browser fills in on page load proves nothing, since
   * whoever is sitting at the unlocked machine gets it for free. Leave it off
   * for sign-in and for new-password fields, where autofill and generation are
   * the behaviour you want.
   */
  noAutofill?: boolean;
} & Omit<React.ComponentProps<typeof Input>, "name" | "id" | "form" | "type">;

export function PasswordField<
  TValues extends FieldValues,
  TContext,
  TTransformed extends FieldValues,
>({
  control,
  name,
  label,
  description,
  className,
  noAutofill = false,
  autoComplete,
  onFocus,
  readOnly,
  ...inputProps
}: PasswordFieldProps<TValues, TContext, TTransformed>) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const { field, fieldState } = useController({ control, name });
  const invalid = Boolean(fieldState.error);

  // Starts hidden on every mount, so a revealed password never survives a
  // navigation back to the form.
  const [visible, setVisible] = useState(false);

  // Autofill happens at page load, and Chrome ignores autocomplete="off" on
  // password inputs — so the only dependable way to keep the field empty is to
  // render it read-only, which both Chrome and the extensions skip, and to drop
  // that on first focus so it can still be typed into normally.
  const [locked, setLocked] = useState(noAutofill);

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>

      <div className="relative">
        <Input
          {...inputProps}
          {...field}
          id={id}
          type={visible ? "text" : "password"}
          // While revealed the input is a plain text field, which browsers will
          // happily spellcheck and auto-capitalise. Neither is wanted here.
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete={noAutofill ? "off" : autoComplete}
          readOnly={locked || readOnly}
          onFocus={(event) => {
            setLocked(false);
            onFocus?.(event);
          }}
          // autocomplete="off" is only advisory, so name the major managers
          // explicitly as well. Each ignores a field marked this way.
          data-lpignore={noAutofill ? "true" : undefined}
          data-1p-ignore={noAutofill ? "true" : undefined}
          data-bwignore={noAutofill ? "true" : undefined}
          data-form-type={noAutofill ? "other" : undefined}
          // Room for the toggle, so a long password never runs under it.
          className={`pr-9 ${className ?? ""}`}
          value={field.value ?? ""}
          aria-invalid={invalid}
          aria-describedby={description ? descriptionId : undefined}
        />

        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          // The label carries the state for screen readers, so the icon swap is
          // decorative. aria-pressed additionally reports it as a toggle.
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          disabled={inputProps.disabled}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>

      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
    </Field>
  );
}
