import { cn } from "@/lib/utils"

/** Inisial nama author dalam lingkaran (dekoratif; nama lengkap selalu tampil di sebelahnya). */
export function AuthorInitial({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary",
        className
      )}
    >
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  )
}
