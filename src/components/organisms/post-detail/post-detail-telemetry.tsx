"use client"

import * as React from "react"
import { Activity, Check, CheckCircle2, ChevronDown, ChevronsUpDown, ChevronUp, Copy, XCircle } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { describeExecutionLog, formatLogTime } from "@/lib/queue/execution-log"
import { notify } from "@/lib/ui/notify"
import { cn } from "@/lib/utils"
import type { ExecutionLog } from "@/types/posts"

/** Blok JSON dengan tombol salin. */
function JsonBlock({ data, title }: { data: Record<string, unknown>; title: string }) {
  const [copied, setCopied] = React.useState(false)
  const json = React.useMemo(() => JSON.stringify(data, null, 2), [data])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      notify.error("Gagal menyalin ke clipboard.")
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-2xs font-semibold tracking-wider text-foreground/80 uppercase">{title}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {copied ? <Check aria-hidden="true" className="size-3 text-success-strong" /> : <Copy aria-hidden="true" className="size-3" />}
          {copied ? "Tersalin" : "Salin JSON"}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto rounded-md border border-border/70 bg-muted/60 p-2.5 font-mono text-xs leading-relaxed text-foreground select-all">
        {json}
      </pre>
    </div>
  )
}

function LogEntry({
  log,
  index,
  expanded,
  onToggle,
}: {
  log: ExecutionLog
  index: number
  expanded: boolean
  onToggle: () => void
}) {
  const view = describeExecutionLog(log)
  const panelId = React.useId()
  const hasPayload = Boolean(view.input || view.output)
  const isToolCall = log.step === "tool_call"
  const Chevron = expanded ? ChevronUp : ChevronDown

  return (
    <li
      className={cn(
        "overflow-hidden rounded-xl border text-xs transition-colors",
        view.isError ? "border-destructive/40 bg-destructive/5" : "border-border/80 bg-card"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 p-3.5 text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      >
        <span className="flex min-w-0 items-start gap-3">
          {view.isError ? (
            <XCircle aria-label="Gagal" className="mt-0.5 size-4 shrink-0 text-destructive-strong" />
          ) : (
            <CheckCircle2 aria-label="Berhasil" className="mt-0.5 size-4 shrink-0 text-success-strong" />
          )}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-muted-foreground">{String(index + 1).padStart(2, "0")}.</span>
              <span className="text-xs font-bold text-foreground">{view.title}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">{view.code}</span>
            </span>
            <span className="line-clamp-1 text-xs text-muted-foreground">{view.description}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{formatLogTime(log.created_at)}</span>
          {view.durationMs !== null && (
            <span className="rounded bg-muted/80 px-2 py-0.5 font-mono text-xs font-medium text-foreground">
              {view.durationMs} ms
            </span>
          )}
          <Chevron aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </span>
      </button>

      {expanded && (
        <div id={panelId} className="flex flex-col gap-3 border-t border-border/50 bg-muted/10 px-4 pt-2 pb-4">
          {hasPayload ? (
            <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-2">
              <JsonBlock
                title={isToolCall ? "Parameter tool (input)" : "Payload masukan (input)"}
                data={view.input ?? { info: "Tidak ada parameter input khusus" }}
              />
              <JsonBlock
                title={isToolCall ? "Hasil eksekusi tool (output)" : "Hasil keluaran (output)"}
                data={view.output ?? { info: "Node selesai tanpa output objek" }}
              />
            </div>
          ) : (
            <p className="rounded-lg border border-border/60 bg-card p-3 text-xs text-muted-foreground">{log.message}</p>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Log eksekusi per node/tool (input & output JSON) — log baru ditambahkan live lewat Realtime.
 * Semua langkah terbuka secara default; status buka/tutup per log disimpan selama halaman terbuka.
 */
export function PostDetailTelemetry({ logs }: { logs: ExecutionLog[] }) {
  // Hanya simpan pengecualian dari default (terbuka) agar log live yang baru masuk ikut terbuka.
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set())
  const allExpanded = logs.every((log) => !collapsed.has(log.id))

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Card className="overflow-hidden border-border/80 shadow-2xs">
      <CardHeader className="border-b border-border/60 bg-muted/20 py-3">
        <CardTitle className="text-sm font-semibold">Eksekusi tiap node (input &amp; output JSON)</CardTitle>
        <CardDescription className="text-xs">
          Rincian masukan dan keluaran setiap langkah Agent Profile run serta pengiriman ke WordPress.
        </CardDescription>
        {logs.length > 0 && (
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setCollapsed(allExpanded ? new Set(logs.map((log) => log.id)) : new Set())}
              className="gap-1.5"
            >
              <ChevronsUpDown aria-hidden="true" className="size-3.5" />
              {allExpanded ? "Tutup semua" : "Buka semua langkah"}
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="p-4">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 p-8 text-center text-xs text-muted-foreground">
            <Activity aria-hidden="true" className="size-5" />
            <span className="font-medium text-foreground">Belum ada catatan aktivitas</span>
            <p>Aktivitas tiap langkah muncul di sini begitu artikel mulai diproses.</p>
          </div>
        ) : (
          <ol role="log" aria-label="Log eksekusi artikel" className="flex flex-col gap-3">
            {logs.map((log, index) => (
              <LogEntry
                key={log.id}
                log={log}
                index={index}
                expanded={!collapsed.has(log.id)}
                onToggle={() => toggle(log.id)}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
