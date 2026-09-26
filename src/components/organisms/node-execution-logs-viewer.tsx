"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Terminal,
  Activity,
  ArrowRight,
} from "lucide-react"

export interface NodeExecutionLogItem {
  node: string
  label: string
  status: "success" | "error" | "skipped"
  durationMs: number
  input: Record<string, unknown>
  output: Record<string, unknown>
  message?: string
  timestamp: string
}

interface NodeExecutionLogsViewerProps {
  logs: NodeExecutionLogItem[]
  className?: string
  defaultOpen?: boolean
}

function JsonBlock({ data, title }: { data: Record<string, unknown>; title: string }) {
  const [copied, setCopied] = React.useState(false)
  const jsonString = React.useMemo(() => JSON.stringify(data, null, 2), [data])

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span className="font-semibold uppercase tracking-wider">{title}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer text-[10px]"
        >
          {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
          <span>{copied ? "Tersalin" : "Salin"}</span>
        </button>
      </div>
      <pre className="max-h-60 overflow-y-auto overflow-x-auto rounded-md bg-muted/60 p-2.5 font-mono text-[10.5px] leading-relaxed text-foreground border border-border/70 select-all">
        {jsonString}
      </pre>
    </div>
  )
}

export function NodeExecutionLogsViewer({
  logs,
  className,
  defaultOpen = false,
}: NodeExecutionLogsViewerProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)
  const [expandedNodes, setExpandedNodes] = React.useState<Record<string, boolean>>(() => {
    // Default: buka node terakhir atau yang error
    const initial: Record<string, boolean> = {}
    logs.forEach((log, idx) => {
      if (log.status === "error" || idx === logs.length - 1) {
        initial[log.node] = true
      }
    })
    return initial
  })

  if (!logs || logs.length === 0) {
    return null
  }

  const toggleNode = (nodeName: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeName]: !prev[nodeName],
    }))
  }

  const totalDuration = logs.reduce((acc, curr) => acc + (curr.durationMs || 0), 0)

  return (
    <Card className={cn("border-border/80 shadow-xs bg-card overflow-hidden", className)}>
      <CardHeader
        className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
            <Terminal className="size-4 text-primary" />
            <CardTitle className="text-xs font-semibold">
              Log Eksekusi Node Telemetri ({logs.length} Node)
            </CardTitle>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <Clock className="size-3" />
              <span>{totalDuration}ms</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            >
              {isOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-1 pb-4 px-4 flex flex-col gap-2.5 border-t border-border/60">
          <p className="text-[11px] text-muted-foreground pt-1">
            Pantau rincian masukan (*input*) dan keluaran (*output*) setiap node yang dieksekusi di State Machine pipeline.
          </p>

          <div className="flex flex-col gap-2">
            {logs.map((log, index) => {
              const isExpanded = expandedNodes[log.node] ?? false
              const isSuccess = log.status === "success"

              return (
                <div
                  key={`${log.node}-${index}`}
                  className={cn(
                    "rounded-lg border transition-all text-xs",
                    isSuccess
                      ? "border-border/80 bg-background/50"
                      : "border-destructive/30 bg-destructive/5"
                  )}
                >
                  {/* Header Item */}
                  <div
                    onClick={() => toggleNode(log.node)}
                    className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-muted/40 transition-colors gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isSuccess ? (
                        <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="size-4 text-destructive shrink-0" />
                      )}
                      <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                        {String(index + 1).padStart(2, "0")}.
                      </span>
                      <span className="font-semibold text-foreground truncate">
                        {log.label}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground/70 hidden sm:inline">
                        ({log.node})
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {log.durationMs !== undefined && (
                        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {log.durationMs}ms
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="size-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Body Expand (Input & Output Inspector) */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-border/50 flex flex-col gap-3">
                      {log.message && (
                        <div className="text-[11px] text-muted-foreground italic flex items-center gap-1.5">
                          <Activity className="size-3 text-primary shrink-0" />
                          <span>{log.message}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Input Block */}
                        <JsonBlock data={log.input} title="Payload Masukan (Input)" />

                        {/* Output Block */}
                        <JsonBlock data={log.output} title="Hasil Keluaran (Output)" />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
