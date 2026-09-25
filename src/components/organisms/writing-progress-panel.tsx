"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card"
import { cn } from "@/lib/utils"
import {
  Blocks,
  CheckCircle2,
  CircleDashed,
  FileText,
  Loader2,
  PenLine,
  TriangleAlert,
  UploadCloud,
} from "lucide-react"

export interface WritingStage {
  id: string
  label: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
}

export const WRITING_STAGES: WritingStage[] = [
  {
    id: "brief",
    label: "Menyusun brief & struktur",
    hint: "Topik dipetakan menjadi kerangka tulisan",
    icon: FileText,
  },
  {
    id: "draft",
    label: "Menulis naskah",
    hint: "Bahasa mengalir, bebas frasa klise",
    icon: PenLine,
  },
  {
    id: "blocks",
    label: "Merapikan blok Gutenberg",
    hint: "Markdown dikonversi ke blok native WP",
    icon: Blocks,
  },
  {
    id: "sync",
    label: "Mengirim ke WordPress",
    hint: "Resolusi tag, kategori, dan unggah pos",
    icon: UploadCloud,
  },
]

interface WritingProgressPanelProps {
  activeIndex: number
  elapsedMs: number
  failed?: boolean
  className?: string
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function WritingProgressPanel({
  activeIndex,
  elapsedMs,
  failed = false,
  className,
}: WritingProgressPanelProps) {
  const total = WRITING_STAGES.length
  const completedCount = Math.min(activeIndex, total)
  const percent = Math.round((completedCount / total) * 100)

  return (
    <Card
      className={cn(
        "border-primary/30 bg-card shadow-xs",
        failed ? "border-destructive/40" : "border-primary/30",
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {failed ? (
              <TriangleAlert className="size-4 text-destructive" />
            ) : (
              <Loader2 className="size-4 animate-spin text-primary" />
            )}
            <span>
              {failed ? "Proses tulis terhenti" : "Sedang menulis artikel Anda"}
            </span>
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatElapsed(elapsedMs)}
            </span>
            <span
              className={cn(
                "font-mono text-sm font-bold tabular-nums",
                failed ? "text-destructive" : "text-primary"
              )}
            >
              {percent}%
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {/* Progress bar */}
        <div className="flex flex-col gap-2">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Kemajuan proses penulisan"
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700 ease-out",
                failed ? "bg-destructive" : "bg-primary"
              )}
              style={{ width: `${failed ? Math.max(percent, 8) : Math.max(percent, 10)}%` }}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>
              Tahap {Math.min(activeIndex + 1, total)} dari {total}
            </span>
            <span>{failed ? "Terhenti" : "Perkiraan waktu selesai: 30–60 detik"}</span>
          </div>
        </div>

        {/* Stage list */}
        <ol className="flex flex-col">
          {WRITING_STAGES.map((stage, index) => {
            const isDone = index < activeIndex || (!failed && activeIndex >= total)
            const isActive = index === activeIndex && !failed
            const Icon = stage.icon

            return (
              <li key={stage.id} className="relative flex gap-3 pb-4 last:pb-0">
                {index < WRITING_STAGES.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px",
                      isDone ? "bg-primary/50" : "bg-border"
                    )}
                  />
                )}

                <span
                  className={cn(
                    "relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full border transition-colors",
                    isDone
                      ? "border-primary bg-primary text-primary-foreground"
                      : isActive
                        ? "border-primary bg-background text-primary"
                        : "border-border bg-background text-muted-foreground"
                  )}
                >
                  {isDone ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : isActive ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CircleDashed className="size-3.5" />
                  )}
                </span>

                <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                  <div className="flex items-center gap-2">
                    <Icon
                      className={cn(
                        "size-3.5 shrink-0",
                        isDone
                          ? "text-primary"
                          : isActive
                            ? "text-primary"
                            : "text-muted-foreground/70"
                      )}
                    />
                    <span
                      className={cn(
                        "truncate text-xs font-semibold",
                        isDone || isActive
                          ? "text-foreground"
                          : "text-muted-foreground/80"
                      )}
                    >
                      {stage.label}
                    </span>
                    {isDone && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">
                        selesai
                      </span>
                    )}
                    {isActive && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">
                        berjalan
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] leading-relaxed text-muted-foreground">
                    {stage.hint}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>

        <p className="border-t border-border/70 pt-3 text-[11px] leading-relaxed text-muted-foreground">
          {failed
            ? "Artikel yang sudah tersusun tetap tersimpan di antrean. Anda dapat mengirim ulang tanpa memanggil AI kembali."
            : "Jangan tutup halaman ini. Artikel akan langsung dikirim ke WordPress begitu seluruh tahap selesai."}
        </p>
      </CardContent>
    </Card>
  )
}
