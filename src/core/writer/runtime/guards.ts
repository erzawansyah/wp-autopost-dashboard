import {
  createMiddleware,
  toolCallLimitMiddleware,
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
        const usage = (response as any).usage_metadata
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
 * Membangun rangkaian lengkap Guard Middleware berlapis untuk agent
 */
export function buildGuardMiddlewareStack(limits: AgentLimits, recorder: RunRecorder) {
  const stack: any[] = []

  // 1. Lapisan terluar: Telemetri model call
  stack.push(createTelemetryMiddleware(recorder))

  // 2. Lapisan kedua: Loop Guard, dedupe, dan Circuit Breaker per-tool
  stack.push(createLoopGuardMiddleware({ maxConsecutiveFailures: 2 }, recorder))

  // 3. Batas total pemanggilan tools secara global (exitBehavior: continue agar model sempat menulis naskah)
  if (limits.maxToolCalls > 0) {
    stack.push(
      toolCallLimitMiddleware({
        runLimit: limits.maxToolCalls,
        exitBehavior: "continue",
      })
    )
  }

  // 4. Batas pemanggilan spesifik per-tool (misal web_reader: 4)
  if (limits.perTool) {
    for (const [toolName, limitVal] of Object.entries(limits.perTool)) {
      if (limitVal > 0) {
        stack.push(
          toolCallLimitMiddleware({
            toolName,
            runLimit: limitVal,
            exitBehavior: "continue",
          })
        )
      }
    }
  }

  // 5. Batas total pemanggilan model LLM (exitBehavior: end agar run berhenti dan masuk ke finalize call)
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
