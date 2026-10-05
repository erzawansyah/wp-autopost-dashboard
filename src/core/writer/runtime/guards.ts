import {
  createMiddleware,
  modelCallLimitMiddleware,
} from "langchain"
import { AIMessage } from "@langchain/core/messages"
import { AgentLimits } from "../types/profile"
import { RunRecorder } from "./telemetry"
import { createLoopGuardMiddleware } from "./loop-guard"

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
 */
export function buildGuardMiddlewareStack(limits: AgentLimits, recorder: RunRecorder) {
  const stack: (ReturnType<typeof createMiddleware> | ReturnType<typeof modelCallLimitMiddleware>)[] = []

  // 1. Lapisan terluar: Telemetri model call (wrapModelCall)
  stack.push(createTelemetryMiddleware(recorder))

  // 2. Lapisan kedua: Unified Tool Guard (Loop Guard, Deduplication, Circuit Breaker, dan Kuota Per-Tool / Global)
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

  // 3. Batas total pemanggilan model LLM (exitBehavior: end agar run berhenti dan masuk ke finalize call)
  if (limits.maxModelCalls > 0) {
    stack.push(
      modelCallLimitMiddleware({
        runLimit: limits.maxModelCalls,
        exitBehavior: "end",
      })
    )
  }

  return stack
}
