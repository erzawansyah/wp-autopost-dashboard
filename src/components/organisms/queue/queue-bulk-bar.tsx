"use client"

import { Loader2, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/atoms/button"

interface QueueBulkBarProps {
  selectedCount: number
  /** Jumlah item terpilih yang punya aksi ulang (jalankan/tulis ulang/kirim ulang). */
  retryableCount: number
  isBusy: boolean
  onRetry?: () => void
  onDelete?: () => void
  onClear: () => void
}

/** Bilah aksi massal saat ada baris terpilih. */
export function QueueBulkBar({ selectedCount, retryableCount, isBusy, onRetry, onDelete, onClear }: QueueBulkBarProps) {
  return (
    <div
      role="region"
      aria-label="Aksi massal"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/10 px-4 py-2.5 text-xs"
    >
      <span role="status" className="font-semibold text-primary">
        {selectedCount} artikel dipilih
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {onRetry && (
          <Button size="xs" onClick={onRetry} disabled={isBusy || retryableCount === 0} className="gap-1.5">
            {isBusy ? (
              <Loader2 aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />
            ) : (
              <RotateCcw aria-hidden="true" className="size-3" />
            )}
            Proses ulang {retryableCount} artikel
          </Button>
        )}
        {onDelete && (
          <Button size="xs" variant="destructive" onClick={onDelete} disabled={isBusy} className="gap-1.5">
            <Trash2 aria-hidden="true" className="size-3" />
            Hapus {selectedCount} artikel
          </Button>
        )}
        <Button size="xs" variant="outline" onClick={onClear} disabled={isBusy}>
          Batal pilih
        </Button>
      </div>
    </div>
  )
}
