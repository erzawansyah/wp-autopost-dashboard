import { createMiddleware } from "langchain"
import { ToolMessage } from "@langchain/core/messages"
import { RunRecorder } from "./telemetry"
import { ToolRegistry } from "../tools/registry"

export interface LoopGuardOptions {
  /** Maksimal kegagalan berturut-turut sebelum tool dinonaktifkan untuk run ini (default: 2) */
  maxConsecutiveFailures?: number
}

/**
 * Middleware Loop Guard & Circuit Breaker:
 * 1. Mencegah panggilan duplikat identik (deduplication)
 * 2. Memutus rantai loop jika sebuah tool gagal berulang kali (circuit breaker)
 * 3. Mencegah agent loop tanpa henti saat tool pihak ketiga error/down
 * 4. Mencatat log setiap panggilan tool ke RunRecorder
 */
export function createLoopGuardMiddleware(
  options: LoopGuardOptions = {},
  recorder: RunRecorder
) {
  const maxFailures = options.maxConsecutiveFailures ?? 2
  const callCache = new Map<string, string>()
  const failureCount = new Map<string, number>()
  const disabledTools = new Set<string>()

  return createMiddleware({
    name: "LoopGuardMiddleware",
    wrapToolCall: async (request, handler) => {
      const toolCall = request.toolCall
      const toolName = toolCall.name
      const toolId = toolCall.id || `call_${Date.now()}`
      const toolDef = ToolRegistry.get(toolName)
      const argsObj = (toolCall.args || {}) as Record<string, unknown>

      // 1. Circuit Breaker Check: Apakah tool sudah dinonaktifkan karena gagal berulang kali?
      if (disabledTools.has(toolName)) {
        const disabledMsg = `PERINGATAN: Tool '${toolName}' telah dinonaktifkan sementara karena mengalami kegagalan berulang kali. JANGAN memanggil tool '${toolName}' lagi. Lanjutkan penulisan naskah artikel menggunakan data dan konteks yang sudah tersedia.`

        recorder.recordEvent({
          kind: "guard",
          tool: toolName,
          status: "disabled",
          durationMs: 1,
          argsPreview: argsObj as Record<string, string | number | boolean>,
          summary: `Tool '${toolName}' diblokir oleh Circuit Breaker (gagal >= ${maxFailures}x)`,
        })

        return new ToolMessage({
          content: disabledMsg,
          tool_call_id: toolId,
          name: toolName,
        })
      }

      // 2. Deduplication Check: Apakah argumen persis sama pernah dipanggil sebelumnya?
      const normalizedArgs = JSON.stringify(argsObj, Object.keys(argsObj).sort())
      const cacheKey = `${toolName}:${normalizedArgs}`

      if (callCache.has(cacheKey)) {
        const cachedContent = callCache.get(cacheKey)!
        const dedupeMsg = `[HASIL TERSIMPAN DARI PANGGILAN SEBELUMNYA]:\n${cachedContent}\n\nCatatan: Anda sudah pernah memanggil tool ini dengan parameter yang persis sama. Gunakan hasil di atas tanpa memanggil ulang.`

        recorder.recordEvent({
          kind: "guard",
          tool: toolName,
          status: "deduped",
          durationMs: 1,
          argsPreview: argsObj as Record<string, string | number | boolean>,
          summary: `Panggilan '${toolName}' di-deduplikasi (argumen identik)`,
        })

        return new ToolMessage({
          content: dedupeMsg,
          tool_call_id: toolId,
          name: toolName,
        })
      }

      // 3. Eksekusi Tool Sebenarnya dengan Stopwatch & Error Boundary
      const start = Date.now()
      let resultMsg: Awaited<ReturnType<typeof handler>>
      let isError = false
      let rawContent = ""

      try {
        resultMsg = await handler(request)
        const msgContent =
          resultMsg && typeof resultMsg === "object" && "content" in resultMsg
            ? (resultMsg as { content?: unknown }).content
            : undefined
        rawContent = typeof msgContent === "string" ? msgContent : JSON.stringify(msgContent || "")
        if (rawContent.startsWith("ERROR[") || rawContent.includes("ERROR:")) {
          isError = true
        }
      } catch (err: unknown) {
        isError = true
        const errText = err instanceof Error ? err.message : String(err)
        rawContent = `ERROR[tool_execution_exception]: ${errText}`
        resultMsg = new ToolMessage({
          content: rawContent,
          tool_call_id: toolId,
          name: toolName,
        })
      }

      const durationMs = Date.now() - start

      // 4. Update Circuit Breaker State
      if (isError) {
        const currentFailures = (failureCount.get(toolName) || 0) + 1
        failureCount.set(toolName, currentFailures)

        if (currentFailures >= maxFailures) {
          disabledTools.add(toolName)
          recorder.recordEvent({
            kind: "guard",
            tool: toolName,
            status: "blocked",
            durationMs: 1,
            summary: `Circuit breaker aktif: Tool '${toolName}' dimatikan karena gagal ${currentFailures}x berturut-turut`,
          })
        }
      } else {
        // Reset counter jika berhasil
        failureCount.set(toolName, 0)
        callCache.set(cacheKey, rawContent)
      }

      // 5. Catat ke RunRecorder
      const summaryText = toolDef
        ? toolDef.summarize(rawContent)
        : rawContent.slice(0, 150)

      recorder.recordEvent({
        kind: "tool_call",
        tool: toolName,
        status: isError ? "error" : "ok",
        durationMs,
        argsPreview: argsObj as Record<string, string | number | boolean>,
        summary: summaryText,
      })

      return resultMsg
    },
  })
}
