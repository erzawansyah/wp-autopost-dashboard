import * as React from "react"
import { Label } from "@/components/atoms/label"
import { cn } from "@/lib/utils"

interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  id?: string
  label?: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}

export function FormField({
  id,
  label,
  required,
  error,
  hint,
  children,
  className,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5 w-full", className)} {...props}>
      {label && (
        <div className="flex items-center justify-between">
          <Label
            htmlFor={id}
            className="text-xs font-semibold text-foreground/90 select-none flex items-center gap-1"
          >
            {label}
            {required && <span className="text-destructive">*</span>}
          </Label>
        </div>
      )}
      {children}
      {hint && !error && (
        <p className="text-[11px] text-muted-foreground leading-normal">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] font-medium text-destructive leading-normal">{error}</p>
      )}
    </div>
  )
}
