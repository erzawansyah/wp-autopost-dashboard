"use client"

import * as React from "react"
import { AlertCircle, Check, CheckCircle2, ListChecks, Loader2, Undo2, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardFooter } from "@/components/atoms/card"
import { useConfirm } from "@/lib/ui/confirm"
import { cn } from "@/lib/utils"
import type { SuggestionReview } from "./use-suggestion-review"

interface SuggestionListContextValue {
  review: SuggestionReview
  approveLabel: string
  approvedLabel: string
}

const SuggestionListContext = React.createContext<SuggestionListContextValue | null>(null)

function useSuggestionList(): SuggestionListContextValue {
  const context = React.use(SuggestionListContext)
  if (!context) throw new Error("<SuggestionItem> harus berada di dalam <SuggestionList>.")
  return context
}

interface SuggestionListProps {
  review: SuggestionReview
  title: string
  description: string
  /** Label tombol per item, mis. "Setujui & Buat di WordPress". */
  approveLabel: string
  /** Label status setelah dibuat, mis. "Aktif di WordPress". */
  approvedLabel: string
  /** Kata benda jamak untuk tombol & konfirmasi massal (mis. "kategori"). */
  noun: string
  children: React.ReactNode
}

/**
 * Daftar rekomendasi AI yang ditinjau pengguna sebelum ditulis ke WordPress (Kategori & Author Creator).
 * Komposisi: `<SuggestionList review=…>{items.map((item, i) => <SuggestionItem index={i}>…</SuggestionItem>)}</SuggestionList>`.
 */
export function SuggestionList({ review, title, description, approveLabel, approvedLabel, noun, children }: SuggestionListProps) {
  const confirm = useConfirm()
  const headingId = React.useId()
  const { total, approved, remaining, pending, rejected } = review.summary

  async function handleApproveAll() {
    const ok = await confirm({
      title: `Buat ${remaining} ${noun} di WordPress?`,
      description:
        "Semua rekomendasi yang belum ditolak dibuat satu per satu langsung di WordPress Anda. Data yang sudah dibuat hanya bisa dihapus manual dari WP-Admin.",
      confirmLabel: `Buat ${remaining} ${noun}`,
    })
    if (ok) review.approveAll()
  }

  return (
    <SuggestionListContext value={{ review, approveLabel, approvedLabel }}>
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3 px-1">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={headingId} className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              <ListChecks aria-hidden="true" className="size-4 text-primary" />
              {title} ({total})
            </h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleApproveAll}
            disabled={remaining === 0 || review.isBulkRunning || pending > 0}
            className="cursor-pointer text-xs font-semibold"
          >
            {review.isBulkRunning ? (
              <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />
            ) : (
              <Check aria-hidden="true" data-icon="inline-start" />
            )}
            {review.isBulkRunning ? "Membuat di WordPress…" : `Setujui semua (${remaining})`}
          </Button>
        </div>

        <p role="status" className="px-1 text-xs text-muted-foreground">
          {approved} dibuat · {remaining} menunggu persetujuan{rejected > 0 ? ` · ${rejected} ditolak` : ""}
          {pending > 0 ? ` · ${pending} sedang diproses` : ""}
        </p>

        <ul className="flex flex-col gap-3">{children}</ul>
      </section>
    </SuggestionListContext>
  )
}

interface SuggestionItemProps {
  index: number
  /** Isi kartu khusus alat (`CardHeader` + `CardContent`); aksi Setujui/Tolak dirender otomatis. */
  children: React.ReactNode
}

export function SuggestionItem({ index, children }: SuggestionItemProps) {
  const { review, approveLabel, approvedLabel } = useSuggestionList()
  const entry = review.entryOf(index)
  const label = review.describe(index)

  if (entry.rejected) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border/80 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{label} ditolak.</span>
        <Button type="button" variant="ghost" size="xs" onClick={() => review.restore(index)} className="cursor-pointer">
          <Undo2 aria-hidden="true" data-icon="inline-start" />
          Urungkan
        </Button>
      </li>
    )
  }

  const isPending = entry.status === "pending"
  const isApproved = entry.status === "approved"

  return (
    <li>
      <Card
        aria-busy={isPending || undefined}
        className={cn("gap-3.5 border-border/80 py-4 shadow-2xs transition-colors", isApproved && "border-success/40 bg-success/5")}
      >
        {children}

        {entry.status === "error" && entry.error && (
          <div className="px-5">
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{entry.error}</AlertDescription>
            </Alert>
          </div>
        )}

        <CardFooter className="flex flex-wrap items-center justify-end gap-2 border-t border-border/50 px-5 pt-3 [.border-t]:pt-3">
          {isApproved ? (
            <span role="status" className="flex items-center gap-1.5 text-xs font-medium text-success-strong">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              {approvedLabel}
              {entry.wpId !== undefined && (
                <Badge variant="success" className="font-mono">
                  #{entry.wpId}
                </Badge>
              )}
            </span>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => review.reject(index)}
                disabled={isPending || review.isBulkRunning}
                className="cursor-pointer text-xs text-muted-foreground hover:text-destructive"
              >
                <X aria-hidden="true" data-icon="inline-start" />
                Tolak<span className="sr-only"> {label}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => review.approve(index)}
                disabled={isPending || review.isBulkRunning}
                className="cursor-pointer text-xs font-semibold"
              >
                {isPending ? (
                  <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />
                ) : (
                  <Check aria-hidden="true" data-icon="inline-start" />
                )}
                {isPending ? "Membuat di WordPress…" : entry.status === "error" ? "Coba lagi" : approveLabel}
                <span className="sr-only"> — {label}</span>
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </li>
  )
}
