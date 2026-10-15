import { AlertCircle, CheckCircle2, Clock, Globe, Loader2, Send, Sparkles, type LucideIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { StatusBadge } from "@/components/molecules/status-badge"
import { SUCCESS_STATES } from "@/lib/queue/states"
import { cn } from "@/lib/utils"
import type { PostItemState } from "@/types/queue"

type StepStatus = "completed" | "active" | "error" | "waiting"

interface StepDefinition {
  label: string
  sublabel: string
  icon: LucideIcon
  status: (state: PostItemState) => StepStatus
}

/** Empat tahap pipeline (PRD §4) dan status tiap tahap menurut `post_items.state`. */
const STEPS: StepDefinition[] = [
  { label: "Masuk Antrean", sublabel: "Topik diterima sistem", icon: Clock, status: () => "completed" },
  {
    label: "Penulisan",
    sublabel: "Menyusun draf naskah",
    icon: Sparkles,
    status: (state) =>
      state === "queued_input"
        ? "waiting"
        : state === "generating_content"
          ? "active"
          : state === "failed_generation"
            ? "error"
            : "completed",
  },
  {
    label: "Kirim WordPress",
    sublabel: "Sinkronisasi ke situs",
    icon: Send,
    status: (state) =>
      state === "queued_input" || state === "generating_content" || state === "failed_generation"
        ? "waiting"
        : state === "ready_to_sync" || state === "syncing_to_wp"
          ? "active"
          : state === "failed_sync"
            ? "error"
            : "completed",
  },
  {
    label: "Selesai",
    sublabel: "Tersimpan di WordPress",
    icon: Globe,
    status: (state) =>
      SUCCESS_STATES.has(state) ? "completed" : state === "failed_generation" || state === "failed_sync" ? "error" : "waiting",
  },
]

const STATUS_STYLE: Record<StepStatus, { border: string; icon: string; srLabel: string }> = {
  completed: { border: "border-success/30", icon: "bg-success/10 text-success-strong", srLabel: "selesai" },
  active: { border: "border-primary/50 bg-primary/5", icon: "bg-primary/10 text-primary", srLabel: "sedang berjalan" },
  error: { border: "border-destructive/40", icon: "bg-destructive/10 text-destructive-strong", srLabel: "gagal" },
  waiting: { border: "border-border/70", icon: "bg-muted/40 text-muted-foreground", srLabel: "menunggu" },
}

function StepIndicator({ status, index }: { status: StepStatus; index: number }) {
  if (status === "completed") return <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success-strong" />
  if (status === "active") {
    return <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
  }
  if (status === "error") return <AlertCircle aria-hidden="true" className="size-4 shrink-0 text-destructive-strong" />
  return <span aria-hidden="true" className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
}

/** Alur visual state machine artikel + kendala terakhir (bila belum sukses). */
export function PostDetailStepper({ state, lastError }: { state: PostItemState; lastError?: string | null }) {
  return (
    <section
      aria-label="Status pengerjaan"
      className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <h2 className="text-sm font-semibold text-foreground">Status pengerjaan</h2>
        <StatusBadge status={state} />
      </div>

      <ol className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => {
          const status = step.status(state)
          const style = STATUS_STYLE[status]
          const Icon = step.icon
          return (
            <li key={step.label} className={cn("flex items-start gap-3 rounded-lg border bg-card p-3", style.border)}>
              <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", style.icon)}>
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center justify-between gap-1">
                  <span className="truncate text-xs font-bold text-foreground">
                    {step.label}
                    <span className="sr-only"> — {style.srLabel}</span>
                  </span>
                  <StepIndicator status={status} index={index} />
                </span>
                <span className="line-clamp-1 text-xs text-muted-foreground">{step.sublabel}</span>
              </span>
            </li>
          )
        })}
      </ol>

      {lastError && !SUCCESS_STATES.has(state) && (
        <Alert variant="destructive" role="note">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Kendala eksekusi</AlertTitle>
          <AlertDescription>{lastError}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}
