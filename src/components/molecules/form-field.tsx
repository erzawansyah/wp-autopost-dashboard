"use client"

import * as React from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/atoms/field"
import { HelpTooltip } from "@/components/molecules/help-tooltip"
import { cn } from "@/lib/utils"

export interface FormFieldProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** `id` kontrol di dalamnya; dipakai `htmlFor` label serta id hint/error (`${id}-hint`, `${id}-error`). */
  id?: string
  label?: string
  required?: boolean
  error?: string
  hint?: React.ReactNode
  tooltip?: React.ReactNode
  children: React.ReactNode
}

/** id elemen hint/error untuk `aria-describedby` kontrol (pasangan dari `FormField`). */
export function formFieldDescribedBy(id: string, { error, hint }: { error?: string; hint?: React.ReactNode }) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

/**
 * Kerangka satu field form (label + petunjuk + kontrol + hint/error) di atas atom shadcn `Field`.
 * Presentasional: dipakai langsung oleh form lama, dan oleh `ControlledField` (react-hook-form + zod)
 * yang otomatis mengisi `error`, `aria-invalid`, dan `aria-describedby`. Form baru → pakai `ControlledField`.
 */
export function FormField({ id, label, required, error, hint, tooltip, children, className, ...props }: FormFieldProps) {
  const invalid = Boolean(error)

  return (
    <Field data-invalid={invalid || undefined} className={cn("gap-1.5", className)} {...props}>
      {label && (
        <div className="flex min-h-5 items-center gap-1.5">
          <FieldLabel
            htmlFor={id}
            className="gap-1 text-xs font-semibold text-foreground/90 select-none group-data-[invalid=true]/field:text-destructive"
          >
            <span>{label}</span>
            {required && (
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            )}
          </FieldLabel>
          {tooltip && <HelpTooltip content={tooltip} />}
        </div>
      )}
      {children}
      {hint && !error && (
        <FieldDescription id={id ? `${id}-hint` : undefined} className="text-xs leading-normal">
          {hint}
        </FieldDescription>
      )}
      {error && (
        <FieldError id={id ? `${id}-error` : undefined} className="text-xs leading-normal font-medium">
          {error}
        </FieldError>
      )}
    </Field>
  )
}
