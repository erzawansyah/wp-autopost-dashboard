"use client"

import * as React from "react"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/atoms/button"

interface JsonCodeViewerProps {
  data: unknown
  title?: string
  maxHeight?: string
  defaultExpanded?: boolean
}

export function JsonCodeViewer({
  data,
  title,
  maxHeight = "max-h-96",
}: JsonCodeViewerProps) {
  const [copied, setCopied] = React.useState(false)

  const formattedContent = React.useMemo(() => {
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return JSON.stringify({ output: data }, null, 2)
      }
    }
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }, [data])

  const handleCopy = () => {
    navigator.clipboard.writeText(formattedContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-muted/30 overflow-hidden font-mono text-xs">
      <div className="flex items-center justify-between border-b border-border/70 bg-muted/60 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {title || "Output Data"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="size-3 text-emerald-500" />
              <span>Tersalin</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Salin</span>
            </>
          )}
        </Button>
      </div>
      <div className={`overflow-auto p-3 text-foreground ${maxHeight}`}>
        <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
          {formattedContent}
        </pre>
      </div>
    </div>
  )
}
