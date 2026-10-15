"use client"

import * as React from "react"
import {
  Controller,
  type ControllerFieldState,
  type ControllerProps,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"
import { FormField, formFieldDescribedBy } from "@/components/molecules/form-field"

/** Props siap-sebar ke kontrol: `field` RHF + id/aria yang sudah tersambung ke label, hint, dan error. */
export type ControlledFieldControlProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = ControllerRenderProps<TFieldValues, TName> & {
  id: string
  "aria-invalid": boolean
  "aria-describedby"?: string
  "aria-required"?: boolean
}

export interface ControlledFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> extends Pick<ControllerProps<TFieldValues, TName, TTransformedValues>, "control" | "name" | "disabled"> {
  label?: string
  hint?: React.ReactNode
  tooltip?: React.ReactNode
  required?: boolean
  className?: string
  /** Render kontrol; sebar `control` ke `Input`/`Textarea`, atau petakan manual untuk Select/Switch/Checkbox. */
  children: (
    control: ControlledFieldControlProps<TFieldValues, TName>,
    fieldState: ControllerFieldState
  ) => React.ReactNode
}

/**
 * Field react-hook-form standar Panitera: `Controller` + `FormField` (label, hint, tooltip, pesan error zod).
 *
 *   const form = useZodForm(CreateSiteBodySchema, { defaultValues: { site_name: "", base_url: "", … } })
 *   <ControlledField control={form.control} name="base_url" label="Alamat website" required hint="https://blogku.com">
 *     {(field) => <Input {...field} type="url" autoComplete="url" />}
 *   </ControlledField>
 *   <ControlledField control={form.control} name="role" label="Peran">
 *     {({ value, onChange, id, ...aria }) => (
 *       <Select value={value} onValueChange={onChange}><SelectTrigger id={id} {...aria}>…</SelectTrigger>…</Select>
 *     )}
 *   </ControlledField>
 */
export function ControlledField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>({
  control,
  name,
  disabled,
  label,
  hint,
  tooltip,
  required,
  className,
  children,
}: ControlledFieldProps<TFieldValues, TName, TTransformedValues>) {
  const id = React.useId()

  return (
    <Controller
      control={control}
      name={name}
      disabled={disabled}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message
        return (
          <FormField id={id} label={label} hint={hint} tooltip={tooltip} required={required} error={error} className={className}>
            {children(
              {
                ...field,
                id,
                "aria-invalid": fieldState.invalid,
                "aria-describedby": formFieldDescribedBy(id, { error, hint }),
                "aria-required": required || undefined,
              },
              fieldState
            )}
          </FormField>
        )
      }}
    />
  )
}
