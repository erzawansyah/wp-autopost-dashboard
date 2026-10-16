import { createMiddleware, ToolInvocationError } from "langchain"
import { ToolMessage } from "@langchain/core/messages"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { failureFromError, toolFailure, type ToolErrorCode, type ToolFailure } from "@/core/shared/tools/contract"
import { RunRecorder } from "./telemetry"
import { ToolRegistry } from "../tools/registry"
import { formatToolFailure, readToolArtifact, type ToolArtifact } from "../tools/tool-response"
import { AgentLimits } from "../types/profile"

export interface LoopGuardOptions {
  /** Maksimal kegagalan berturut-turut sebelum tool dinonaktifkan untuk run ini (default: 2) */
  maxConsecutiveFailures?: number
  /** Batas kuota eksekusi tool sistem (global dan per-tool) */
  limits?: AgentLimits
}

/**
 * Kegagalan tingkat-tool: tool mustahil berhasil selama sisa run (kredensial tidak tersedia atau ditolak),
 * jadi circuit breaker langsung terbuka tanpa menunggu kegagalan berikutnya. Kegagalan lain (URL 404,
 * SSRF, timeout, dll.) bersifat per-argumen dan tetap dihitung menuju ambang `maxConsecutiveFailures`.
 */
const TOOL_LEVEL_FAILURE_CODES: ReadonlySet<ToolErrorCode> = new Set<ToolErrorCode>([
  "missing_credentials",
  "unauthorized",
])

type ArgsPreview = Record<string, string | number | boolean>

/** Hasil sukses yang disimpan untuk deduplikasi panggilan identik. */
interface CachedToolResult {
  content: string
  artifact?: ToolArtifact
}

function messageText(message: ToolMessage): string {
  return typeof message.content === "string" ? message.content : JSON.stringify(message.content)
}

/** Pemberitahuan panggilan yang diblokir guard (prompt `system-tool-guard-blocked.md`). */
function renderBlockedNotice(reason: string, target: string): string {
  const template = loadPrompt("system-tool-guard-blocked.md", "WARNING: {{reason}} Finish the article with the data you already have.", "system")
  return renderPrompt(template, { reason, target })
}

/** Balasan panggilan identik yang di-deduplikasi (prompt `system-tool-guard-deduped.md`). */
function renderDedupedNotice(cachedContent: string): string {
  const template = loadPrompt("system-tool-guard-deduped.md", "[CACHED RESULT]: {{cachedContent}}", "system")
  return renderPrompt(template, { cachedContent })
}

/**
 * Outcome hasil tool, dibaca dari data terstruktur (bukan parsing teks "ERROR[...]"):
 * 1. Universal Tools → artifact `ToolOutcome`;
 * 2. tool di luar kontrak (mis. tool bawaan Deep Agent) → gagal bila `ToolMessage.status === "error"`;
 * 3. hasil berupa `Command` (pembaruan state Deep Agent) → sukses tanpa artifact.
 */
function readOutcome(result: unknown): { artifact?: ToolArtifact; failure?: ToolFailure } {
  const artifact = readToolArtifact(result)
  if (artifact) return { artifact, failure: artifact.ok ? undefined : artifact }
  if (ToolMessage.isInstance(result) && result.status === "error") {
    const failure = toolFailure("upstream_error", messageText(result))
    return { artifact: failure, failure }
  }
  return {}
}

/** Galat yang dilempar eksekusi tool → kegagalan bertipe (argumen tidak lolos schema → `invalid_input`). */
function failureFromThrown(err: unknown): ToolFailure {
  if (ToolInvocationError.isInstance(err)) {
    return toolFailure("invalid_input", `Argumen tool tidak valid: ${err.toolError.message}`)
  }
  return failureFromError(err)
}

/**
 * Middleware Loop Guard, Circuit Breaker & Quota Limiter (Unified Tool Guard). Empat jaminan
 * (`.claude/rules/writer-components-standard.md` §5) bersama `guards.ts` & `finalize.ts`:
 * 1. Kuota global & per-tool ditegakkan tanpa menambah node graf ekstra (panggilan diblokir → artifact
 *    `quota_exceeded`, tidak dihitung sebagai kegagalan tool).
 * 2. Panggilan identik dengan panggilan sukses sebelumnya di-deduplikasi (hasil lama + artifact lama).
 * 3. Circuit breaker: tool dinonaktifkan setelah `maxConsecutiveFailures` kegagalan berturut-turut, atau
 *    langsung pada kegagalan tingkat-tool (`TOOL_LEVEL_FAILURE_CODES`). Panggilan berikutnya → `circuit_open`.
 *    Kegagalan dibaca dari artifact `ToolOutcome` (`ok: false`), bukan dari teks "ERROR[...]".
 * 4. Setiap panggilan dicatat ke RunRecorder (ringkasan dari `ToolDefinition.summarize(outcome)`).
 * Pembatalan run (`runtime.signal` abort) tidak dihitung sebagai kegagalan: galatnya diteruskan agar run berhenti.
 */
export function createLoopGuardMiddleware(
  options: LoopGuardOptions = {},
  recorder: RunRecorder
) {
  const maxFailures = options.maxConsecutiveFailures ?? 2
  const limits = options.limits
  const callCache = new Map<string, CachedToolResult>()
  const failureCount = new Map<string, number>()
  const toolCallCounts = new Map<string, number>()
  let totalToolCalls = 0
  const disabledTools = new Set<string>()

  return createMiddleware({
    name: "LoopGuardMiddleware",
    wrapToolCall: async (request, handler) => {
      const toolCall = request.toolCall
      const toolName = toolCall.name
      const toolId = toolCall.id || `call_${Date.now()}`
      const toolDef = ToolRegistry.get(toolName)
      const argsObj = (toolCall.args || {}) as Record<string, unknown>
      const argsPreview = argsObj as ArgsPreview

      /** Panggilan ditolak sebelum dieksekusi: pemberitahuan untuk LLM + artifact kegagalan bertipe. */
      const rejectCall = (
        failure: ToolFailure,
        target: string,
        status: "blocked" | "disabled",
        summary: string
      ): ToolMessage => {
        recorder.recordEvent({ kind: "guard", tool: toolName, status, durationMs: 1, argsPreview, summary })
        return new ToolMessage({
          content: renderBlockedNotice(failure.message, target),
          tool_call_id: toolId,
          name: toolName,
          status: "error",
          artifact: failure,
        })
      }

      // 1. Quota Check (Global): Apakah kuota total panggilan tool sudah tercapai?
      const maxToolCalls = limits?.maxToolCalls ?? 0
      if (maxToolCalls > 0 && totalToolCalls >= maxToolCalls) {
        return rejectCall(
          toolFailure("quota_exceeded", `Batas total panggilan tool sistem (${maxToolCalls} kali) telah tercapai.`),
          "any tool except `extract-article`",
          "blocked",
          `Tool '${toolName}' diblokir: batas total tool calls (${maxToolCalls}) tercapai`
        )
      }

      // 2. Quota Check (Per-Tool): Apakah kuota panggilan untuk tool ini sudah tercapai?
      const perToolLimit = limits?.perTool?.[toolName]
      const currentToolCount = toolCallCounts.get(toolName) || 0
      if (typeof perToolLimit === "number" && perToolLimit > 0 && currentToolCount >= perToolLimit) {
        return rejectCall(
          toolFailure("quota_exceeded", `Batas pemanggilan tool '${toolName}' (${perToolLimit} kali) telah tercapai.`),
          `tool '${toolName}'`,
          "blocked",
          `Tool '${toolName}' diblokir: batas per-tool (${perToolLimit}) tercapai`
        )
      }

      // 3. Circuit Breaker Check: Apakah tool sudah dinonaktifkan karena gagal berulang kali?
      if (disabledTools.has(toolName)) {
        return rejectCall(
          toolFailure("circuit_open", `Tool '${toolName}' telah dinonaktifkan sementara karena mengalami kegagalan berulang kali.`),
          `tool '${toolName}'`,
          "disabled",
          `Tool '${toolName}' diblokir oleh Circuit Breaker (gagal >= ${maxFailures}x)`
        )
      }

      // 4. Deduplication Check: Apakah argumen persis sama pernah dipanggil sebelumnya (dan sukses)?
      const normalizedArgs = JSON.stringify(argsObj, Object.keys(argsObj).sort())
      const cacheKey = `${toolName}:${normalizedArgs}`
      const cached = callCache.get(cacheKey)
      if (cached) {
        recorder.recordEvent({
          kind: "guard",
          tool: toolName,
          status: "deduped",
          durationMs: 1,
          argsPreview,
          summary: `Panggilan '${toolName}' di-deduplikasi (argumen identik)`,
        })

        return new ToolMessage({
          content: renderDedupedNotice(cached.content),
          tool_call_id: toolId,
          name: toolName,
          artifact: cached.artifact,
        })
      }

      // Hitung panggilan tool yang valid
      toolCallCounts.set(toolName, currentToolCount + 1)
      totalToolCalls += 1

      // 5. Eksekusi Tool Sebenarnya dengan Stopwatch & Error Boundary
      const start = Date.now()
      let result: Awaited<ReturnType<typeof handler>>
      let artifact: ToolArtifact | undefined
      let failure: ToolFailure | undefined

      try {
        result = await handler(request)
        const outcome = readOutcome(result)
        artifact = outcome.artifact
        failure = outcome.failure
        // Status pesan diselaraskan dengan artifact agar provider/konsumen melihat kegagalan yang sama.
        if (failure && ToolMessage.isInstance(result) && result.status !== "error") {
          result = new ToolMessage({
            content: result.content,
            tool_call_id: result.tool_call_id,
            name: result.name,
            status: "error",
            artifact: result.artifact,
          })
        }
      } catch (err: unknown) {
        // Run dibatalkan (timeout/abort): bukan kegagalan tool, biarkan galat menghentikan run.
        if (request.runtime.signal?.aborted) throw err
        failure = failureFromThrown(err)
        artifact = failure
        result = new ToolMessage({
          content: formatToolFailure(failure),
          tool_call_id: toolId,
          name: toolName,
          status: "error",
          artifact: failure,
        })
      }

      const durationMs = Date.now() - start

      // 6. Update Circuit Breaker State
      if (failure) {
        const currentFailures = (failureCount.get(toolName) || 0) + 1
        failureCount.set(toolName, currentFailures)

        const toolLevel = TOOL_LEVEL_FAILURE_CODES.has(failure.code)
        if (currentFailures >= maxFailures || toolLevel) {
          disabledTools.add(toolName)
          recorder.recordEvent({
            kind: "guard",
            tool: toolName,
            status: "blocked",
            durationMs: 1,
            summary: toolLevel
              ? `Circuit breaker aktif: Tool '${toolName}' dimatikan karena kegagalan tingkat-tool [${failure.code}]`
              : `Circuit breaker aktif: Tool '${toolName}' dimatikan karena gagal ${currentFailures}x berturut-turut`,
          })
        }
      } else {
        // Reset counter jika berhasil; hanya ToolMessage (bukan Command) yang dapat diputar ulang.
        failureCount.set(toolName, 0)
        if (ToolMessage.isInstance(result)) {
          callCache.set(cacheKey, { content: messageText(result), artifact })
        }
      }

      // 7. Catat ke RunRecorder (ringkasan dari outcome; tool di luar registry memakai teks/kode kegagalan)
      const summaryText =
        toolDef && artifact
          ? toolDef.summarize(artifact)
          : failure
            ? `Gagal [${failure.code}]: ${failure.message}`
            : ToolMessage.isInstance(result)
              ? messageText(result).slice(0, 150)
              : `Tool '${toolName}' selesai`

      recorder.recordEvent({
        kind: "tool_call",
        tool: toolName,
        status: failure ? "error" : "ok",
        durationMs,
        argsPreview,
        summary: summaryText,
      })

      return result
    },
  })
}
