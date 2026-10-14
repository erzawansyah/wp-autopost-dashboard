import { ArticleSource, FeaturedImageMeta, InContentImage } from "../types/contracts"
import { redactSecretsInText } from "./redact"

export type StepEventKind = "model_call" | "tool_call" | "guard" | "finalize" | "summary"

export interface AgentStepEvent {
  kind: StepEventKind
  index: number
  tool?: string
  status: "ok" | "error" | "blocked" | "deduped" | "disabled"
  durationMs: number
  /** Ringkasan argumen yang disanitasi: dipotong maksimal 120 karakter, tanpa kredensial */
  argsPreview?: Record<string, string | number | boolean>
  /** Ringkasan 1 baris yang informatif dan terpadu (maksimal 240 karakter) */
  summary: string
  tokens?: { prompt: number; completion: number }
  requestedTools?: string[]
  timestamp: string
}

export interface RunTelemetrySummary {
  status: "running" | "completed" | "failed"
  stopReason?: string
  modelCalls: number
  toolCalls: number
  tokensPrompt: number
  tokensCompletion: number
  durationMs: number
  wordCount: number
  sourcesCount: number
  imagesCount: number
  errorMessage?: string
}

/**
 * Recorder in-memory untuk menangkap event eksekusi secara real-time
 * dan membatasi ukuran teks agar tidak ada payload dump yang membebani database.
 */
export class RunRecorder {
  private events: AgentStepEvent[] = []
  private startTime: number = Date.now()
  private modelCalls: number = 0
  private toolCalls: number = 0
  private tokensPrompt: number = 0
  private tokensCompletion: number = 0

  // Koleksi data terstruktur yang dikumpulkan selama agent berjalan
  public readonly sources: Map<string, ArticleSource> = new Map()
  public readonly inContentImages: InContentImage[] = []
  public featuredImage?: FeaturedImageMeta
  public featuredMediaId?: number
  public resolvedCategoryIds: number[] = []
  public resolvedTagNames: string[] = []
  public resolvedAuthorId?: number

  // Listener opsional untuk streaming event log (misal ke database execution_logs)
  private onEventListener?: (event: AgentStepEvent) => void

  constructor(onEventListener?: (event: AgentStepEvent) => void) {
    this.onEventListener = onEventListener
  }

  public recordEvent(event: Omit<AgentStepEvent, "index" | "timestamp">): AgentStepEvent {
    // Redaksi dilakukan sebelum pemotongan agar token rahasia tidak lolos sebagian.
    const sanitizedSummary = redactSecretsInText(event.summary || "").slice(0, 240).trim()
    const sanitizedArgs: Record<string, string | number | boolean> = {}

    if (event.argsPreview && typeof event.argsPreview === "object") {
      let count = 0
      for (const [k, v] of Object.entries(event.argsPreview)) {
        if (count >= 6) break
        // Skip potential sensitive keys
        if (/password|key|token|auth|secret/i.test(k)) continue
        if (typeof v === "string") {
          const safe = redactSecretsInText(v)
          sanitizedArgs[k] = safe.length > 120 ? safe.slice(0, 117) + "..." : safe
        } else if (typeof v === "number" || typeof v === "boolean") {
          sanitizedArgs[k] = v
        }
        count++
      }
    }

    const fullEvent: AgentStepEvent = {
      ...event,
      index: this.events.length + 1,
      summary: sanitizedSummary,
      argsPreview: Object.keys(sanitizedArgs).length > 0 ? sanitizedArgs : undefined,
      timestamp: new Date().toISOString(),
    }

    if (event.kind === "model_call") this.modelCalls++
    if (event.kind === "tool_call" && event.status !== "deduped" && event.status !== "blocked") this.toolCalls++
    if (event.tokens) {
      this.tokensPrompt += event.tokens.prompt || 0
      this.tokensCompletion += event.tokens.completion || 0
    }

    this.events.push(fullEvent)

    if (this.onEventListener) {
      try {
        this.onEventListener(fullEvent)
      } catch (err) {
        console.warn("[RunRecorder] Gagal meneruskan event ke listener:", err)
      }
    }

    return fullEvent
  }

  public getEvents(): AgentStepEvent[] {
    return [...this.events]
  }

  public getSummary(status: "running" | "completed" | "failed", stopReason?: string, wordCount: number = 0, errorMessage?: string): RunTelemetrySummary {
    return {
      status,
      stopReason,
      modelCalls: this.modelCalls,
      toolCalls: this.toolCalls,
      tokensPrompt: this.tokensPrompt,
      tokensCompletion: this.tokensCompletion,
      durationMs: Date.now() - this.startTime,
      wordCount,
      sourcesCount: this.sources.size,
      imagesCount: (this.featuredImage ? 1 : 0) + this.inContentImages.length,
      errorMessage,
    }
  }

  public trackSource(source: ArticleSource) {
    if (!source.url) return
    const existing = this.sources.get(source.url)
    if (existing) {
      if (source.readFull) existing.readFull = true
      if (source.title) existing.title = source.title
      if (source.snippet && !existing.snippet) existing.snippet = source.snippet
    } else {
      this.sources.set(source.url, { ...source })
    }
  }
}
