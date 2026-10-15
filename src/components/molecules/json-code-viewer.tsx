"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { notify } from "@/lib/ui/notify"
import { cn } from "@/lib/utils"

interface JsonCodeViewerProps {
  data: unknown
  title?: string
  /** Kelas tinggi maksimum area kode (mis. `max-h-96`). */
  maxHeight?: string
  /** `true` → string ditampilkan apa adanya (Markdown/Gutenberg), bukan diparse sebagai JSON. */
  rawText?: boolean
}

function formatContent(data: unknown, rawText: boolean): string {
  if (typeof data === "string") {
    if (rawText) return data
    try {
      return JSON.stringify(JSON.parse(data), null, 2)
    } catch {
      return data
    }
  }
  try {
    return JSON.stringify(data, null, 2) ?? String(data)
  } catch {
    return String(data)
  }
}

/** Blok kode baca-saja (JSON/teks mentah) dengan tombol salin. Konten dirender sebagai teks (di-escape React). */
export function JsonCodeViewer({ data, title = "Output Data", maxHeight = "max-h-96", rawText = false }: JsonCodeViewerProps) {
  const [copied, setCopied] = React.useState(false)
  const formattedContent = React.useMemo(() => formatContent(data, rawText), [data, rawText])

  React.useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  function handleCopy() {
    navigator.clipboard.writeText(formattedContent).then(
      () => setCopied(true),
      () => notify.error("Gagal menyalin ke clipboard. Salin teks secara manual.")
    )
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-muted/30 font-mono text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/60 px-3 py-1.5">
        <span className="truncate text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={handleCopy}
          className="text-2xs text-muted-foreground hover:text-foreground"
          aria-label={`Salin ${title}`}
        >
          {copied ? <Check aria-hidden="true" className="text-success-strong" /> : <Copy aria-hidden="true" />}
          <span aria-live="polite">{copied ? "Tersalin" : "Salin"}</span>
        </Button>
      </div>
      <div className={cn("overflow-auto p-3 text-foreground", maxHeight)}>
        <pre className="font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">{formattedContent}</pre>
      </div>
    </div>
  )
}
