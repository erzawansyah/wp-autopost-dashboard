import crypto from "crypto"
import {
  WriterRequest,
  WriterResult,
  NodeExecutionLog,
  ExecutionTrace,
} from "./types/contracts"
import { AgentProfile } from "./types/profile"
import { DecryptedUserKeys } from "@/types/settings"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { validateAndSanitizeInput } from "./runtime/validate-input"
import { resolveAgentProfile } from "./runtime/resolve-profile"
import { runAgentWriter } from "./runtime/run-agent"
import { AgentStepEvent } from "./runtime/telemetry"
import type { GenerationCheckpointOptions } from "./runtime/checkpoints"
import type { LlmUsageLedger } from "@/core/shared/llm/usage"
import { redactRecord, redactSecrets } from "@/lib/security/redact"

export interface WriterRunOptions {
  userId?: string
  profile?: AgentProfile
  userKeys?: DecryptedUserKeys
  onEventListener?: (event: AgentStepEvent) => void
  abortSignal?: AbortSignal
  /**
   * Opsional: resume dari checkpoint langkah (`pre_resolve`, `draft`) percobaan sebelumnya dan callback
   * penyimpanan setiap langkah yang selesai. Tanpa opsi ini run berjalan penuh tanpa persistensi.
   */
  checkpoints?: GenerationCheckpointOptions
  /** Ledger pemakaian LLM milik pemanggil; tetap terbaca walau `run()` melempar exception. */
  usageLedger?: LlmUsageLedger
}

/**
 * Pintu masuk utama (Facade Orchestrator) untuk penulisan artikel berbasis LangChain Agent Profile.
 * Menggantikan arsitektur lama berbasis node dan pipeline engine yang kaku.
 *
 * @param rawRequest - Payload request mentah
 * @param options    - Opsi eksekusi (userId, profile override, BYOK keys, atau telemetry event listener)
 */
export async function run(
  rawRequest: unknown,
  options?: WriterRunOptions | string
): Promise<WriterResult> {
  const startTime = Date.now()
  const rawObj = (typeof rawRequest === "object" && rawRequest !== null ? rawRequest : {}) as Record<string, unknown>
  const requestId = (rawObj.requestId as string) || crypto.randomUUID()

  // Normalisasi opsi (dukungan backward-compatible jika parameter kedua string userId)
  const normalizedOptions: WriterRunOptions =
    typeof options === "string" ? { userId: options } : options || {}

  // 1. Validasi input request menggunakan modul validasi terpadu
  const validatorStart = Date.now()
  const validation = validateAndSanitizeInput(rawRequest)
  const validatorDuration = Date.now() - validatorStart

  const validatorLog: NodeExecutionLog = {
    node: "input_validator",
    label: "Validasi Schema & Sanitasi",
    status: (validation.isValid ? "success" : "error") as "success" | "error",
    durationMs: validatorDuration,
    // Payload mentah & hasil sanitasi memuat kredensial terdekripsi (site.applicationPassword, apiKey):
    // wajib diredaksi sebelum masuk nodeLogs yang dapat dikembalikan ke browser / disimpan.
    input: redactRecord(rawObj),
    output: validation.isValid
      ? { sanitized: redactSecrets(validation.sanitizedRequest) }
      : { error: validation.error },
    message: validation.isValid ? "Payload valid dan tersanitasi" : `Validasi gagal: ${validation.error?.message}`,
    timestamp: new Date().toISOString(),
  }

  if (!validation.isValid || !validation.sanitizedRequest) {
    return {
      success: false,
      status: "failed",
      execution: {
        engine: "unknown",
        nodesExecuted: ["input_validator"],
        nodeLogs: [validatorLog],
        durationMs: Date.now() - startTime,
        retries: 0,
        modelUsed: "none",
        warnings: [],
      },
      error: {
        code: validation.error?.code || "INVALID_INPUT",
        message: validation.error?.message || "Validasi parameter gagal",
        retryable: false,
      },
    }
  }

  const request: WriterRequest = {
    ...validation.sanitizedRequest,
    requestId,
  }

  const effectiveUserId =
    normalizedOptions.userId ||
    request.userId ||
    (rawObj.userId as string | undefined)

  // 2. Resolusi Agent Profile (dari opsi, DB Supabase, atau preset bawaan)
  const targetRef = request.agentProfileRef || request.engine || "preset:research-writer"
  const profile =
    normalizedOptions.profile ||
    (await resolveAgentProfile(targetRef, effectiveUserId))

  // 3. Ambil Kunci BYOK User jika belum dioper
  const userKeys =
    normalizedOptions.userKeys ||
    (effectiveUserId ? await getUserDecryptedKeys(effectiveUserId) : {
      searchPreferences: { default_provider: "auto" },
    })

  // 4. Eksekusi Agentic Writer Runtime (listener telemetri hanya lewat opsi, bukan payload request)
  const agentRunResult = await runAgentWriter({
    request,
    profile,
    userKeys,
    userId: effectiveUserId,
    onEventListener: normalizedOptions.onEventListener,
    abortSignal: normalizedOptions.abortSignal,
    checkpoints: normalizedOptions.checkpoints,
    usageLedger: normalizedOptions.usageLedger,
  })

  const summary = agentRunResult.recorder.getSummary(
    agentRunResult.success ? "completed" : "failed",
    agentRunResult.stopReason,
    agentRunResult.article?.wordCount || 0,
    agentRunResult.error?.message
  )

  const stepEvents = agentRunResult.recorder.getEvents()

  // Konversi stepEvents ke nodeLogs untuk kompatibilitas penuh dengan visualizer PostDetailTelemetry
  const convertedNodeLogs: NodeExecutionLog[] = [
    validatorLog,
    ...stepEvents.map((evt) => ({
      node: evt.tool || evt.kind,
      label: evt.tool ? `Tool: ${evt.tool}` : `Agent: ${evt.kind}`,
      status: (evt.status === "ok" ? "success" : evt.status === "error" ? "error" : "skipped") as "success" | "error" | "skipped",
      durationMs: evt.durationMs,
      input: evt.argsPreview || {},
      output: { summary: evt.summary },
      message: evt.summary,
      timestamp: evt.timestamp,
    })),
  ]

  const nodesExecuted = [
    "input_validator",
    `agent_${profile.mode}`,
    ...stepEvents.map((e) => e.tool || e.kind).filter(Boolean),
  ]

  const execution: ExecutionTrace = {
    engine: profile.ref,
    agentProfileRef: profile.ref,
    nodesExecuted,
    nodeLogs: convertedNodeLogs,
    stepEvents,
    durationMs: Date.now() - startTime,
    retries: 0,
    tokenUsage: {
      prompt: summary.tokensPrompt,
      completion: summary.tokensCompletion,
      total: summary.tokensTotal,
    },
    costUsd: summary.costUsd,
    llmCalls: summary.llmCalls,
    modelUsage: summary.modelUsage,
    modelUsed: agentRunResult.model,
    warnings: [],
  }

  if (!agentRunResult.success || !agentRunResult.article) {
    return {
      success: false,
      status: "failed",
      sources: agentRunResult.sources,
      agentRun: summary,
      execution,
      error: agentRunResult.error || {
        code: "GENERATION_FAILED",
        message: "Agent gagal menghasilkan naskah artikel",
        retryable: true,
      },
    }
  }

  return {
    success: true,
    status: "draft_ready",
    article: agentRunResult.article,
    sources: agentRunResult.sources,
    enrichment: agentRunResult.enrichment,
    agentRun: summary,
    execution,
  }
}

// Re-export tipe dan modul penting
export * from "./types/contracts"
export * from "./types/profile"
export * from "./profiles/builtin"
export * from "./presets/registry"
export * from "./tools"
export * from "./runtime/telemetry"
export * from "./runtime/validate-input"
export * from "./runtime/resolve-profile"
export * from "./runtime/run-agent"
export * from "./runtime/postprocess"
export * from "./runtime/output-schema"
export * from "../shared/tools/wordpress-publisher"
export * from "../shared/tools/web-search"
export * from "../shared/tools/web-reader"
export * from "../shared/tools/image-search"
export * from "../shared/tools/upload-media"
export * from "../shared/formatters/gutenberg"
export * from "../shared/formatters/markdown-cleaner"
