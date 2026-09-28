import * as React from "react"
import { Label } from "@/components/atoms/label"
import { HelpTooltip } from "@/components/molecules/help-tooltip"
import { cn } from "@/lib/utils"

interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  id?: string
  label?: string
  required?: boolean
  error?: string
  hint?: string
  tooltip?: React.ReactNode
  children: React.ReactNode
}

export function FormField({
  id,
  label,
  required,
  error,
  hint,
  tooltip,
  children,
  className,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5 w-full", className)} {...props}>
      {label && (
        <div className="flex min-h-6 items-center justify-between">
          <Label
            htmlFor={id}
            className="text-xs font-semibold text-foreground/90 select-none flex items-center gap-1.5"
          >
            <span>{label}</span>
            {required && <span className="text-destructive">*</span>}
            {tooltip && <HelpTooltip content={tooltip} />}
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
