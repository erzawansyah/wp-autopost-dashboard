import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Callout shadcn `Alert` dengan varian peran status Panitera (token `globals.css`, terang & gelap).
 * Pengganti div callout ber-kelas palet mentah (`bg-emerald-500/15 text-emerald-600 …`).
 * `role="alert"` hanya untuk pesan yang muncul akibat aksi pengguna; callout statis pakai `role="note"`.
 */
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-3.5 py-3 text-xs has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-2.5 [&>svg]:size-4 [&>svg]:translate-y-px [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive-strong",
        success: "border-success/30 bg-success/10 text-success-strong",
        warning: "border-warning/30 bg-warning/10 text-warning-strong",
        info: "border-info/30 bg-info/10 text-info-strong",
        ai: "border-ai-process/30 bg-ai-process/10 text-ai-process-strong",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  role = "alert",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role={role} className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 line-clamp-1 min-h-4 font-semibold tracking-tight", className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 grid justify-items-start gap-1 leading-relaxed [&_p]:leading-relaxed", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
