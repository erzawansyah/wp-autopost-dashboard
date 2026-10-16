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
function createModelCallBudgetMiddleware(limit: number, recorder: RunRecorder) {
  let used = 0
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
        const notice = loadPrompt("system-model-call-limit.md", MODEL_CALL_LIMIT_FALLBACK, "system")
        return new AIMessage(renderPrompt(notice, { limit }))
      }
      used += 1
      return handler(request)
    },
  })
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

      if (AIMessage.isInstance(response)) {
        const usage = "usage_metadata" in response
          ? (response as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata
          : undefined
        const tokens = usage
          ? {
              prompt: usage.input_tokens || 0,
              completion: usage.output_tokens || 0,
            }
          : undefined

        const requestedTools = response.tool_calls?.map((tc) => tc.name) || []

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
export function buildGuardMiddlewareStack(limits: AgentLimits, recorder: RunRecorder) {
  const stack: ReturnType<typeof createMiddleware>[] = []

  // 1. Lapisan terluar: anggaran panggilan model per run (panggilan yang diblokir tidak dicatat sebagai
  //    model call). Saat habis, agen berakhir dan run masuk ke finalize call.
  if (limits.maxModelCalls > 0) {
    stack.push(createModelCallBudgetMiddleware(limits.maxModelCalls, recorder))
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
