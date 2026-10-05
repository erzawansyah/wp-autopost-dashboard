"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
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
  Activity,
  Layers,
  Cpu,
  ChevronsUpDown,
  Bot,
  BrainCircuit,
  Wrench,
  Sparkles,
} from "lucide-react"

export interface DatabaseExecutionLog {
  id: string
  step: string
  level: "info" | "warn" | "error" | string
  message: string
  details?: Record<string, unknown> | null
  created_at: string
}

export interface AgentRunStepEvent {
  step?: string
  type?: string
  content?: string
  timestamp?: string
  durationMs?: number
  details?: Record<string, unknown>
}

export interface AgentRunInfo {
  id: string
  status: string
  mode: string
  total_model_calls: number
  total_tool_calls: number
  duration_ms: number
  step_events: AgentRunStepEvent[] | null
  agent_profile_ref?: string
}

export interface PostDetailTelemetryProps {
  logs: DatabaseExecutionLog[]
  agentRun?: AgentRunInfo | null
  engineUsed?: string
  modelUsed?: string
  state?: string
  createdAt?: string
  updatedAt?: string
  className?: string
}

/**
 * Peta label ramah untuk masing-masing tool riset & WordPress
 */
const TOOL_LABELS: Record<string, string> = {
  web_search: "Web Search (Penelusuran Internet)",
  keyword_suggestions: "Keyword & LSI Suggestions",
  web_reader: "Web Page Reader (Pembaca URL)",
  image_search: "Pencarian Gambar Bebas Royalti",
  set_featured_image: "Tetapkan Foto Sampul WordPress",
  upload_media: "Unggah Media ke WordPress",
}

/**
 * Peta nama & deskripsi fungsi node / step
 */
const NODE_INFO: Record<string, { label: string; desc: string }> = {
  model_call: {
    label: "Model Reasoning (LLM)",
    desc: "Pemanggilan model kecerdasan buatan untuk merencanakan dan menyusun teks.",
  },
  tool_call: {
    label: "Pemanggilan Tool Mandiri",
    desc: "Agen mengeksekusi tool untuk riset web, kurasi visual, atau taksonomi WordPress.",
  },
  guard: {
    label: "Guardrail & Loop Protection",
    desc: "Pemeriksaan limit komputasi, deduplikasi pemanggilan tool, dan circuit breaker.",
  },
  finalize: {
    label: "Finalisasi Naskah Darurat",
    desc: "Pemanggilan satu kali tanpa tools untuk merangkum hasil jika batas limit tercapai.",
  },
  retry_sync_bypass: {
    label: "Bypass Konten (Idempotent Retry)",
    desc: "Konten artikel sudah siap di database; melewati pembuatan AI untuk langsung kirim ke WordPress.",
  },
  init_queue: {
    label: "Penerimaan Antrean",
    desc: "Menerima topik dan instruksi pengerjaan ke dalam antrean sistem.",
  },
  input_validator: {
    label: "Validasi Schema & Sanitasi",
    desc: "Memvalidasi kelengkapan parameter kata kunci, website, dan sanitasi input.",
  },
  taxonomy_resolver: {
    label: "Pencocokan Taksonomi & Author",
    desc: "Memetakan kategori, tag, dan author yang sesuai dengan database website.",
  },
  topic_researcher: {
    label: "Riset Topik & Cetak Biru",
    desc: "Menganalisis maksud pencarian, entitas semantik (LSI), dan merancang outline terstruktur.",
  },
  article_drafter: {
    label: "Penulisan Naskah AI",
    desc: "Menghasilkan draf naskah lengkap, judul artikel, dan kutipan (excerpt).",
  },
  image_curator: {
    label: "Kurasi & Penyisipan Gambar",
    desc: "Mencari foto berkualitas bebas royalti dan menyematkannya ke subbab artikel.",
  },
  quality_checker: {
    label: "Pemeriksaan Kualitas",
    desc: "Mengevaluasi kelayakan naskah, heading Markdown, dan bebas penolakan chatbot.",
  },
  agentic_writer: {
    label: "Agentic Writer (Autonomous Tools)",
    desc: "Autonomous LangChain agent memilih tools web search, reader, dan upload media secara mandiri.",
  },
  deepagent_writer: {
    label: "DeepAgent Writer (LangChain Deep Agents)",
    desc: "LangChain Deep Agent dengan Todo planning, konteks filesystem, skills on-demand, dan tools otonom.",
  },
  gutenberg_formatter: {
    label: "Serialisasi Blok Gutenberg",
    desc: "Mengonversi naskah Markdown menjadi blok native WordPress (<!-- wp:... -->).",
  },
  prepare_sync: {
    label: "Persiapan Sinkronisasi",
    desc: "Menyiapkan payload naskah dan ID taksonomi sebelum dikirim ke website.",
  },
  wordpress_publisher: {
    label: "Pengiriman ke WordPress REST API",
    desc: "Mengirimkan artikel ke WordPress REST API via Application Password.",
  },
  status_sync: {
    label: "Penyelesaian Status",
    desc: "Mencatat status final artikel (terbit/draf) dan URL artikel di WordPress.",
  },
}

/**
 * Komponen penampil blok JSON interaktif dengan tombol salin
 */
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
        <span className="font-semibold uppercase tracking-wider text-[10px] text-foreground/80">
          {title}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer text-[10px]"
        >
          {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
          <span>{copied ? "Tersalin" : "Salin JSON"}</span>
        </button>
      </div>
      <pre className="max-h-72 overflow-y-auto overflow-x-auto rounded-md bg-muted/60 p-2.5 font-mono text-[10.5px] leading-relaxed text-foreground border border-border/70 select-all">
        {jsonString}
      </pre>
    </div>
  )
}

export function PostDetailTelemetry({
  logs,
  agentRun,
  engineUsed = "quick",
  modelUsed = "openrouter",
  state,
  createdAt,
  updatedAt,
  className,
}: PostDetailTelemetryProps) {
  // Default: SEMUA langkah dibuka otomatis agar JSON input & output langsung terlihat
  const [expandedNodes, setExpandedNodes] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    logs.forEach((log) => {
      initial[log.id] = true
    })
    return initial
  })

  const toggleNode = (logId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [logId]: !(prev[logId] ?? true),
    }))
  }

  const toggleAll = (expand: boolean) => {
    const next: Record<string, boolean> = {}
    logs.forEach((log) => {
      next[log.id] = expand
    })
    setExpandedNodes(next)
  }

  const isCompleted =
    state === "published_on_wp" ||
    state === "saved_draft_on_wp" ||
    state === "scheduled_on_wp" ||
    state === "failed_sync" ||
    state === "failed_generation"

  // Hitung durasi waktu pengerjaan
  const effectiveDurationMs = React.useMemo(() => {
    const fromNodes = logs.reduce((acc, log) => {
      const dur = typeof log.details?.durationMs === "number" ? log.details.durationMs : 0
      return acc + dur
    }, 0)
    if (fromNodes > 0) return fromNodes

    if (logs.length >= 2) {
      const first = new Date(logs[0].created_at).getTime()
      const last = new Date(logs[logs.length - 1].created_at).getTime()
      const diff = last - first
      if (diff > 0) return diff
    }

    if (createdAt && updatedAt && isCompleted) {
      const diff = new Date(updatedAt).getTime() - new Date(createdAt).getTime()
      if (diff > 0) return diff
    }

    return 0
  }, [logs, createdAt, updatedAt, isCompleted])

  const durationText = React.useMemo(() => {
    if (effectiveDurationMs > 0) {
      const sec = (effectiveDurationMs / 1000).toFixed(1)
      return `${sec} detik`
    }
    if (isCompleted) {
      return "< 1 detik"
    }
    return "Sedang diproses..."
  }, [effectiveDurationMs, isCompleted])

  const hasLogs = logs && logs.length > 0
  const isAllExpanded = hasLogs && logs.every((log) => (expandedNodes[log.id] ?? true))

  // Hitung total tool calls & model calls dari log jika agentRun belum lengkap
  const computedModelCalls = React.useMemo(() => {
    if (typeof agentRun?.total_model_calls === "number" && agentRun.total_model_calls > 0) {
      return agentRun.total_model_calls
    }
    const fromLogs = logs.filter((l) => l.step === "model_call").length
    return fromLogs > 0 ? fromLogs : 1
  }, [agentRun, logs])

  const computedToolCalls = React.useMemo(() => {
    if (typeof agentRun?.total_tool_calls === "number") {
      return agentRun.total_tool_calls
    }
    return logs.filter(
      (l) => l.step === "tool_call" && l.details?.status !== "blocked" && l.details?.status !== "deduped"
    ).length
  }, [agentRun, logs])

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Kartu Metrik Ringkas Agen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-2xs flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
            {agentRun?.mode === "deep" ? (
              <BrainCircuit className="size-3 text-primary" />
            ) : (
              <Bot className="size-3 text-primary" />
            )}
            <span>Agen Runtime</span>
          </div>
          <span className="text-xs font-semibold font-mono text-foreground capitalize truncate">
            {agentRun ? (agentRun.mode === "deep" ? "Deep Agent" : "Standard Agent") : (engineUsed || "Standard")}
          </span>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-2xs flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
            <Cpu className="size-3 text-primary" />
            <span>Model Calls</span>
          </div>
          <span className="text-xs font-semibold font-mono text-foreground">
            {computedModelCalls} pemanggilan
          </span>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-2xs flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
            <Wrench className="size-3 text-primary" />
            <span>Tool Calls</span>
          </div>
          <span className="text-xs font-semibold font-mono text-foreground">
            {computedToolCalls} dieksekusi
          </span>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-2xs flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
            <Clock className="size-3 text-primary" />
            <span>Waktu Proses</span>
          </div>
          <span className="text-xs font-semibold font-mono text-foreground">
            {durationText}
          </span>
        </div>
      </div>

      {/* Rincian Log Eksekusi per Node dengan JSON Input & Output */}
      <Card className="border-border/80 bg-card shadow-2xs overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-border/60 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xs font-semibold text-foreground">
                Eksekusi Tiap Node (Input &amp; Output JSON)
              </CardTitle>
              <CardDescription className="text-[11px] text-muted-foreground">
                Menampilkan rincian payload masukan (*input*) dan hasil keluaran (*output*) setiap node secara terperinci.
              </CardDescription>
            </div>

            {hasLogs && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => toggleAll(!isAllExpanded)}
                className="gap-1.5 text-xs h-7 self-start sm:self-auto cursor-pointer font-medium"
              >
                <ChevronsUpDown className="size-3.5" />
                <span>{isAllExpanded ? "Tutup Semua" : "Buka Semua Langkah"}</span>
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4 flex flex-col gap-3">
          {!hasLogs ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground text-xs gap-1.5">
              <Activity className="size-5 text-muted-foreground" />
              <span className="font-medium text-foreground">Belum ada catatan aktivitas</span>
              <p className="text-[11px]">
                Aktivitas eksekusi node akan muncul di sini begitu artikel mulai diproses.
              </p>
            </div>
          ) : (
            logs.map((log, index) => {
              const isExpanded = expandedNodes[log.id] ?? true
              const isError = log.level === "error" || log.details?.status === "error"
              const duration = typeof log.details?.durationMs === "number" ? log.details.durationMs : null

              // 1. Ekstraksi nama tool, pesan asli, dan identitas node
              let rawToolName = (log.details?.tool as string) || ""
              let stepLabel = log.step
              const bracketMatch = log.message.match(/^\[(.*?)\]\s*(.*)$/)
              if (bracketMatch) {
                stepLabel = bracketMatch[1]
                if (!rawToolName && bracketMatch[1] !== log.step) {
                  rawToolName = bracketMatch[1]
                }
              }

              // 2. Tentukan Judul dan Deskripsi yang nyata & informatif
              let title = ""
              let desc = ""

              if (log.step === "tool_call") {
                const friendlyName = TOOL_LABELS[rawToolName] || rawToolName || "Tool Riset"
                title = `Eksekusi Tool: ${friendlyName}`
                desc = (log.details?.summary as string) || bracketMatch?.[2] || log.message
              } else if (log.step === "model_call") {
                title = "Model Reasoning (LLM)"
                desc = (log.details?.summary as string) || bracketMatch?.[2] || log.message
              } else if (log.step === "guard") {
                title = "Guardrail & Loop Protection"
                desc = (log.details?.summary as string) || bracketMatch?.[2] || log.message
              } else if (log.step === "finalize") {
                title = "Finalisasi Naskah (Direct Synthesis)"
                desc = (log.details?.summary as string) || bracketMatch?.[2] || log.message
              } else {
                const info = NODE_INFO[log.step]
                title = info?.label || stepLabel
                desc = (log.details?.summary as string) || bracketMatch?.[2] || info?.desc || log.message
              }

              // 3. Susun data JSON Input & Output yang kaya konteks
              let inputData: Record<string, unknown> | undefined = undefined
              let outputData: Record<string, unknown> | undefined = undefined

              if (log.details?.input && typeof log.details.input === "object") {
                inputData = log.details.input as Record<string, unknown>
              } else if (log.details?.argsPreview && typeof log.details.argsPreview === "object") {
                inputData = log.details.argsPreview as Record<string, unknown>
              }

              if (log.details?.output && typeof log.details.output === "object") {
                outputData = log.details.output as Record<string, unknown>
              } else if (log.step === "tool_call") {
                outputData = {
                  tool: rawToolName || "tool",
                  status: log.details?.status || "ok",
                  ringkasan: (log.details?.summary as string) || bracketMatch?.[2] || log.message,
                  ...(duration !== null ? { durasi_eksekusi: `${duration} ms` } : {}),
                }
              } else if (log.step === "model_call") {
                outputData = {
                  status: log.details?.status || "ok",
                  ringkasan: (log.details?.summary as string) || bracketMatch?.[2] || log.message,
                  ...(log.details?.tokens ? { tokens: log.details.tokens } : {}),
                  ...(log.details?.requestedTools ? { tools_diminta: log.details.requestedTools } : {}),
                  ...(duration !== null ? { durasi_inferensi: `${duration} ms` } : {}),
                }
              } else if (log.step === "guard") {
                outputData = {
                  status: log.details?.status || "ok",
                  alasan: (log.details?.summary as string) || bracketMatch?.[2] || log.message,
                }
              }

              const hasPayload = Boolean(inputData || outputData)

              const formattedTime = new Date(log.created_at).toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })

              return (
                <div
                  key={log.id}
                  className={cn(
                    "rounded-xl border transition-all text-xs overflow-hidden",
                    isError
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border/80 bg-card hover:border-border"
                  )}
                >
                  {/* Header Baris Node */}
                  <div
                    onClick={() => toggleNode(log.id)}
                    className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-muted/30 transition-colors gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {isError ? (
                        <XCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                      )}

                      <div className="flex flex-col min-w-0 gap-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[11px] font-bold text-muted-foreground">
                            {String(index + 1).padStart(2, "0")}.
                          </span>
                          <span className="font-bold text-foreground text-xs">
                            {title}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {rawToolName || log.step}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground leading-snug line-clamp-1">
                          {desc}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
                        {formattedTime}
                      </span>
                      {duration !== null && (
                        <span className="font-mono text-[10.5px] font-medium text-foreground bg-muted/80 px-2 py-0.5 rounded">
                          {duration}ms
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Body Expandable: 2 Kolom JSON Input & JSON Output */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-border/50 bg-muted/10 flex flex-col gap-3">
                      {hasPayload ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          {/* JSON Input */}
                          <JsonBlock
                            title={log.step === "tool_call" ? "Parameter Tool (Input)" : "Payload Masukan (JSON Input)"}
                            data={inputData || { info: "Tidak ada parameter input khusus" }}
                          />

                          {/* JSON Output */}
                          <JsonBlock
                            title={log.step === "tool_call" ? "Hasil Eksekusi Tool (Output)" : "Hasil Keluaran (JSON Output)"}
                            data={outputData || { info: "Node selesai tanpa output objek" }}
                          />
                        </div>
                      ) : (
                        <div className="p-3 rounded-lg border border-border/60 bg-card text-[11px] text-muted-foreground">
                          {log.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
