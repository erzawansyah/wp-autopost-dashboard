"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { notify } from "@/lib/ui/notify"

/** Salin isi Markdown panduan ke clipboard. */
export function CopyMarkdownButton({ content }: { content: string }) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  function handleCopy() {
    navigator.clipboard.writeText(content).then(
      () => setCopied(true),
      () => notify.error("Gagal menyalin ke clipboard. Salin teks secara manual.")
    )
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="shrink-0 text-muted-foreground hover:text-foreground">
      {copied ? <Check aria-hidden="true" className="text-success-strong" /> : <Copy aria-hidden="true" />}
      <span aria-live="polite">{copied ? "Tersalin" : "Salin Markdown"}</span>
    </Button>
  )
}
