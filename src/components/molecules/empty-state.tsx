import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { LucideIcon, Layers } from "lucide-react"
import { cn } from "@/lib/utils"

const emptyStateIconVariants = cva("mb-4 flex size-12 items-center justify-center rounded-full", {
  variants: {
    variant: {
      default: "bg-muted/60 text-muted-foreground",
      destructive: "bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
})

interface EmptyStateProps extends VariantProps<typeof emptyStateIconVariants> {
  icon?: LucideIcon
  title: string
  description?: React.ReactNode
  /** Slot aksi (mis. `<Button>` atau `<Button asChild><Link/></Button>`); aman dipakai dari Server Component. */
  children?: React.ReactNode
  className?: string
}

/**
 * Panel status kosong / galat / tidak ditemukan. Dipakai untuk daftar kosong dan segmen
 * `loading`/`error`/`not-found`. Aksi disusun lewat `children` (komposisi, bukan prop callback).
 */
export function EmptyState({ icon: Icon = Layers, title, description, children, variant, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center sm:p-12",
        className
      )}
    >
      <div className={emptyStateIconVariants({ variant })}>
        <Icon aria-hidden="true" className="size-6 stroke-[1.5]" />
      </div>
      <h3 className="mb-1 text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mb-5 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>}
      {children && <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  )
}
