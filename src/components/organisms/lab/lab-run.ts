import { apiFetch, isApiClientError } from "@/lib/api/client"
import type { ExecutionTrace, GeneratedArticle, WpEnrichment } from "@/core/writer/types/contracts"

/**
 * Kontrak client `POST /api/lab/run` (logika murni, dapat diuji). Server mengembalikan HTTP 200 untuk hasil
 * sukses MAUPUN kegagalan terkontrol (`ok: false` + `error`/`code`/`retryable`, hasil parsial & telemetri),
 * sedangkan `apiFetch` melempar `ApiClientError` untuk `ok: false` — payload-nya diambil kembali di sini.
 */

export type LabRunBody =
  | { type: "tool"; targetId: string; siteId?: string; params: Record<string, unknown> }
  | {
      type: "agent"
      targetId: string
      siteId?: string
      params: { keyword: string; brief: string; language: string; actionStatus: "draft" }
    }

/** Payload Lab (tanpa envelope); `ok: false` tetap membawa hasil parsial. */
export interface LabRunPayload {
  ok: boolean
  durationMs?: number
  error?: string
  code?: string
  retryable?: boolean
  summary?: string
  output?: unknown
  [key: string]: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Payload kegagalan terkontrol (HTTP 200, `ok: false`) dari error `apiFetch`; selain itu `null`. */
export function labPayloadFromError(error: unknown): LabRunPayload | null {
  if (!isApiClientError(error) || error.status !== 200 || !isRecord(error.payload)) return null
  return { ...error.payload, ok: false }
}

/** Jalankan uji Lab; `signal` membatalkan request (server ikut menghentikan tool/agen lewat `request.signal`). */
export async function postLabRun(body: LabRunBody, signal: AbortSignal): Promise<LabRunPayload> {
  try {
    const data = await apiFetch<Record<string, unknown>>("/api/lab/run", { method: "POST", body, signal })
    return { ...data, ok: true }
  } catch (error) {
    const payload = labPayloadFromError(error)
    if (payload) return payload
    throw error
  }
}

/** Request dibatalkan (`AbortController`): bukan kegagalan yang perlu dilaporkan sebagai error. */
export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError"
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export type LabToolOutcome =
  | { ok: true; output: unknown; summary?: string; durationMs?: number }
  | { ok: false; message: string; code?: string; retryable?: boolean; durationMs?: number }

/** Bentuk `ToolOutcome` Lab: sukses → keluaran tool; gagal → pesan teredaksi + `code` + `retryable`. */
export function toToolOutcome(payload: LabRunPayload): LabToolOutcome {
  if (payload.ok) {
    return { ok: true, output: payload.output ?? payload.result, summary: payload.summary, durationMs: payload.durationMs }
  }
  return {
    ok: false,
    message: payload.error || "Eksekusi tool gagal.",
    code: payload.code,
    retryable: payload.retryable,
    durationMs: payload.durationMs,
  }
}

const TOOL_ERROR_LABELS: Record<string, string> = {
  invalid_input: "Input tidak valid",
  missing_credentials: "Kredensial/kunci belum tersedia",
  unauthorized: "Kredensial ditolak",
  access_denied: "Akses sumber ditolak",
  not_found: "Sumber tidak ditemukan",
  blocked_ssrf: "URL diblokir proteksi Anti-SSRF",
  too_large: "Respons terlalu besar",
  unsupported_content: "Konten tidak didukung",
  rate_limited: "Dibatasi laju request",
  quota_exceeded: "Kuota habis",
  circuit_open: "Tool dinonaktifkan sementara",
  timeout: "Batas waktu tercapai",
  aborted: "Dibatalkan",
  upstream_error: "Galat layanan tujuan",
}

/** Label Indonesia untuk kode `ToolErrorCode`; kode tak dikenal ditampilkan apa adanya. */
export function toolErrorLabel(code: string | undefined): string | undefined {
  if (!code) return undefined
  return TOOL_ERROR_LABELS[code] ?? code
}

// ---------------------------------------------------------------------------
// Agent Profile
// ---------------------------------------------------------------------------

export interface LabAgentRun {
  ok: boolean
  durationMs?: number
  article?: Partial<GeneratedArticle>
  enrichment?: Partial<WpEnrichment>
  execution?: Partial<ExecutionTrace>
  error?: { message: string; code?: string; retryable?: boolean }
  /** Payload lengkap untuk tab Raw JSON. */
  raw: LabRunPayload
}

/** Hasil uji Agent Profile (sukses atau parsial) dari payload Lab. */
export function toAgentRun(payload: LabRunPayload): LabAgentRun {
  const result = isRecord(payload.result) ? payload.result : {}
  const writerError = isRecord(result.error) ? result.error : undefined
  const message = payload.error ?? (typeof writerError?.message === "string" ? writerError.message : undefined)

  return {
    ok: payload.ok,
    durationMs: payload.durationMs,
    article: isRecord(payload.article) ? (payload.article as Partial<GeneratedArticle>) : undefined,
    enrichment: isRecord(payload.enrichment) ? (payload.enrichment as Partial<WpEnrichment>) : undefined,
    execution: isRecord(payload.execution) ? (payload.execution as Partial<ExecutionTrace>) : undefined,
    error:
      payload.ok || !message
        ? undefined
        : {
            message,
            code: typeof writerError?.code === "string" ? writerError.code : payload.code,
            retryable: typeof writerError?.retryable === "boolean" ? writerError.retryable : payload.retryable,
          },
    raw: payload,
  }
}

const NUMBER_FORMAT = new Intl.NumberFormat("id-ID")

export function formatCount(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? NUMBER_FORMAT.format(value) : "—"
}

/** Biaya USD OpenRouter; `null`/tidak ada → "—" (provider tidak melaporkan biaya). */
export function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  if (value === 0) return "$0"
  return `$${value < 0.01 ? value.toFixed(6) : value.toFixed(4)}`
}

export function formatDuration(durationMs: number | undefined): string {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) return "—"
  return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(2)} detik`
}
