import { createMiddleware } from "langchain"
import { AIMessage } from "@langchain/core/messages"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { AgentLimits } from "../types/profile"
import { RunRecorder } from "./telemetry"
import { createLoopGuardMiddleware } from "./loop-guard"

const MODEL_CALL_LIMIT_FALLBACK = "The {{limit}} model call budget for this run is exhausted."

/**
 * Anggaran panggilan model per RUN (bukan per graf): penghitung ada di closure instance middleware ini,
 * sehingga agen utama dan subagent Deep Agent yang memakai instance yang sama berbagi satu anggaran.
 * Saat habis, panggilan model diganti respons pemberitahuan tanpa tool call (prompt
 * `system-model-call-limit.md`) sehingga loop agen/subagent berakhir dan run masuk ke finalize call.
 */
function createModelCallBudgetMiddleware(limit: number, reserved: number, recorder: RunRecorder) {
  let used = 0
  let reserveAnnounced = false
  // Cadangan tidak pernah menghabiskan seluruh anggaran kecil: minimal 2 panggilan tetap bebas untuk riset & menulis.
  const reserve = reserved > 0 ? Math.min(reserved, Math.max(1, limit - 2)) : 0
  const exhaustedNotice = () =>
    new AIMessage(renderPrompt(loadPrompt("system-model-call-limit.md", MODEL_CALL_LIMIT_FALLBACK, "system"), { limit }))

  return createMiddleware({
    name: "RunModelCallBudgetMiddleware",
    wrapModelCall: async (request, handler) => {
      if (used >= limit) {
        recorder.recordEvent({
          kind: "guard",
          tool: "model_call_limit",
          status: "blocked",
          durationMs: 0,
          summary: `Panggilan model diblokir: batas ${limit} panggilan model per run tercapai`,
        })
        return exhaustedNotice()
      }

      // Sisa anggaran dicadangkan untuk menyerahkan & mengoreksi naskah (agen utama = panggilan ber-responseFormat).
      const inReserve = reserve > 0 && limit - used <= reserve
      if (inReserve && !request.responseFormat) {
        // Subagent Deep mode tidak boleh memakai cadangan agen utama: loop subagent diakhiri tanpa menambah `used`.
        recorder.recordEvent({
          kind: "guard",
          tool: "model_call_reserve",
          status: "blocked",
          durationMs: 0,
          summary: `Panggilan model subagent diblokir: ${limit - used} panggilan terakhir dicadangkan untuk penyerahan naskah`,
        })
        return exhaustedNotice()
      }
      used += 1
      if (!inReserve) return handler(request)
      if (!reserveAnnounced) {
        reserveAnnounced = true
        recorder.recordEvent({
          kind: "guard",
          tool: "model_call_reserve",
          status: "blocked",
          durationMs: 0,
          summary: `Sisa ${limit - used + 1} panggilan model dicadangkan untuk penyerahan naskah; tool riset dilepas`,
        })
      }
      // Hanya tool `extract-article` (responseFormat) yang tetap ter-bind: model wajib menyerahkan naskahnya.
      return handler({ ...request, tools: [] })
    },
  })
}

/**
 * Pesan model dari hasil handler `wrapModelCall`: AIMessage biasa (LangChain juga menyerahkan AIMessage saat naskah
 * dikembalikan untuk dikoreksi), atau objek `{structuredResponse, messages}` saat naskah terstruktur diterima.
 */
function modelMessageOf(response: unknown): AIMessage | undefined {
  if (AIMessage.isInstance(response)) return response
  const messages =
    typeof response === "object" && response !== null && "structuredResponse" in response
      ? (response as { messages?: unknown }).messages
      : undefined
  const first = Array.isArray(messages) ? messages[0] : undefined
  return AIMessage.isInstance(first) ? first : undefined
}

/**
 * Middleware untuk mencatat setiap panggilan model LLM ke RunRecorder
 */
function createTelemetryMiddleware(recorder: RunRecorder) {
  return createMiddleware({
    name: "TelemetryMiddleware",
    wrapModelCall: async (request, handler) => {
      const start = Date.now()
      const response = await handler(request)
      const durationMs = Date.now() - start
      const message = modelMessageOf(response)

      if (message) {
        const usage = message.usage_metadata
        const tokens = usage
          ? {
              prompt: usage.input_tokens || 0,
              completion: usage.output_tokens || 0,
            }
          : undefined

        const requestedTools = message.tool_calls?.map((tc) => tc.name) || []

        recorder.recordEvent({
          kind: "model_call",
          status: "ok",
          durationMs,
          tokens,
          requestedTools: requestedTools.length > 0 ? requestedTools : undefined,
          summary:
            requestedTools.length > 0
              ? `Model meminta eksekusi tool: ${requestedTools.join(", ")}`
              : `Model menyelesaikan respons naratif (${durationMs}ms)`,
        })
      }

      return response
    },
  })
}

/**
 * Membangun rangkaian lengkap Guard Middleware berlapis untuk agent.
 * Menggunakan pendekatan Unified Tool Guard pada wrapToolCall untuk menghindari
 * pembuatan puluhan node redundan di StateGraph LangGraph yang memicu GraphRecursionError.
 * Seluruh state guard (anggaran model, kuota tool, dedup, circuit breaker) ada di closure instance,
 * jadi instance yang SAMA wajib dipasang juga di subagent Deep Agent agar batas berlaku per run.
 */
export interface GuardStackOptions {
  /** Panggilan model terakhir yang dicadangkan untuk penyerahan naskah (`createArticleSubmission`). */
  reservedModelCalls?: number
}

export function buildGuardMiddlewareStack(limits: AgentLimits, recorder: RunRecorder, options: GuardStackOptions = {}) {
  const stack: ReturnType<typeof createMiddleware>[] = []

  // 1. Lapisan terluar: anggaran panggilan model per run (panggilan yang diblokir tidak dicatat sebagai
  //    model call). Saat habis, agen berakhir dan run masuk ke finalize call.
  if (limits.maxModelCalls > 0) {
    stack.push(createModelCallBudgetMiddleware(limits.maxModelCalls, options.reservedModelCalls ?? 0, recorder))
  }

  // 2. Telemetri model call (wrapModelCall)
  stack.push(createTelemetryMiddleware(recorder))

  // 3. Unified Tool Guard (Loop Guard, Deduplication, Circuit Breaker, dan Kuota Per-Tool / Global)
  // Berjalan di dalam wrapToolCall pada ToolNode sehingga TIDAK menambah node StateGraph ekstra.
  stack.push(
    createLoopGuardMiddleware(
      {
        maxConsecutiveFailures: 2,
        limits,
      },
      recorder
    )
  )

  return stack
}
