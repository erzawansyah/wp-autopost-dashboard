"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckCircle2, Clock, AlertCircle, Loader2, Sparkles, Send, Globe } from "lucide-react"

export type PipelineStepState =
  | "queued_input"
  | "generating_content"
  | "ready_to_sync"
  | "syncing_to_wp"
  | "published_on_wp"
  | "scheduled_on_wp"
  | "saved_draft_on_wp"
  | "failed_generation"
  | "failed_sync"

interface PostDetailStepperProps {
  state: PipelineStepState
  lastError?: string | null
  className?: string
}

interface StepDefinition {
  id: string
  label: string
  sublabel: string
  icon: React.ComponentType<{ className?: string }>
}

const STEPS: StepDefinition[] = [
  {
    id: "queued",
    label: "Masuk Antrean",
    sublabel: "Topik diterima sistem",
    icon: Clock,
  },
  {
    id: "generation",
    label: "Penulisan",
    sublabel: "Menyusun draf naskah",
    icon: Sparkles,
  },
  {
    id: "sync",
    label: "Kirim WordPress",
    sublabel: "Sinkronisasi ke situs",
    icon: Send,
  },
  {
    id: "completed",
    label: "Selesai",
    sublabel: "Tersimpan di WordPress",
    icon: Globe,
  },
]

export function PostDetailStepper({ state, lastError, className }: PostDetailStepperProps) {
  // Evaluasi indeks aktif berdasarkan state
  const getStepStatus = (index: number) => {
    switch (index) {
      case 0: // Antrean Masuk
        return "completed" // Selalu komplit jika item sudah ada di database

      case 1: // Penulisan AI
        if (state === "queued_input") return "waiting"
        if (state === "generating_content") return "active"
        if (state === "failed_generation") return "error"
        return "completed" // ready_to_sync, syncing_to_wp, published, saved_draft, failed_sync

      case 2: // Kirim WordPress
        if (state === "queued_input" || state === "generating_content" || state === "failed_generation") {
          return "waiting"
        }
        if (state === "ready_to_sync" || state === "syncing_to_wp") return "active"
        if (state === "failed_sync") return "error"
        return "completed" // published, scheduled, saved_draft

      case 3: // Selesai Terbit
        if (
          state === "published_on_wp" ||
          state === "scheduled_on_wp" ||
          state === "saved_draft_on_wp"
        ) {
          return "completed"
        }
        if (state === "failed_generation" || state === "failed_sync") {
          return "error"
        }
        return "waiting"

      default:
        return "waiting"
    }
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <span className="text-xs font-semibold text-foreground">
          Status Pengerjaan
        </span>
        <span className="text-[11px] font-mono text-muted-foreground">
          Status: <strong className="text-foreground">{state}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
        {STEPS.map((step, idx) => {
          const status = getStepStatus(idx)
          const Icon = step.icon

          let borderColor = "border-border/70"
          let bgColor = "bg-muted/20 text-muted-foreground"
          let badgeBadge = null

          if (status === "completed") {
            borderColor = "border-emerald-500/30"
            bgColor = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            badgeBadge = <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          } else if (status === "active") {
            borderColor = "border-primary/50"
            bgColor = "bg-primary/10 text-primary animate-pulse"
            badgeBadge = <Loader2 className="size-4 animate-spin text-primary shrink-0" />
          } else if (status === "error") {
            borderColor = "border-destructive/40"
            bgColor = "bg-destructive/10 text-destructive"
            badgeBadge = <AlertCircle className="size-4 text-destructive shrink-0" />
          } else {
            badgeBadge = <span className="font-mono text-[11px] text-muted-foreground">0{idx + 1}</span>
          }

          return (
            <div
              key={step.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                borderColor,
                status === "active" ? "bg-primary/5" : "bg-card"
              )}
            >
              <div className={cn("flex size-8 items-center justify-center rounded-md shrink-0", bgColor)}>
                <Icon className="size-4" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-foreground truncate">{step.label}</span>
                  {badgeBadge}
                </div>
                <span className="text-[10.5px] text-muted-foreground line-clamp-1">{step.sublabel}</span>
              </div>
            </div>
          )
        })}
      </div>

      {lastError &&
        !["published_on_wp", "saved_draft_on_wp", "scheduled_on_wp"].includes(state) && (
          <div className="mt-1 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive animate-in fade-in-50">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="font-bold">Kendala Eksekusi:</span>
              <span className="text-[11px] leading-relaxed">{lastError}</span>
            </div>
          </div>
        )}
    </div>
  )
}
