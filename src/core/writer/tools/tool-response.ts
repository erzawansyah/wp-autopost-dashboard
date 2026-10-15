import { z } from "zod"
import { ToolMessage } from "@langchain/core/messages"
import type { ToolRunnableConfig } from "@langchain/core/tools"
import { anySignal, toolOutcomeSchema, type ToolFailure, type ToolOutcome } from "@/core/shared/tools/contract"
import type { ToolRuntimeContext } from "./registry"

/**
 * Jembatan kontrak `ToolOutcome` ↔ LangChain (`responseFormat: "content_and_artifact"`).
 *
 * - LLM menerima `content` berupa teks ringkas (format lama dipertahankan, kegagalan tetap
 *   `ERROR[<kode>]: ...`).
 * - `ToolOutcome` lengkap ikut sebagai `ToolMessage.artifact` (tidak dikirim ke LLM) dan dibaca loop guard,
 *   telemetri, serta Lab tanpa parsing teks.
 */

/** Artifact setiap Universal Tool: `ToolOutcome` dengan data sesuai `ToolDefinition.outputSchema`. */
export type ToolArtifact = ToolOutcome<unknown>

/** Pasangan [konten teks untuk LLM, artifact terstruktur]. */
export type ToolResponse = [content: string, artifact: ToolArtifact]

export const TOOL_RESPONSE_FORMAT = "content_and_artifact"

const ToolArtifactSchema = toolOutcomeSchema(z.unknown())

/** Teks kegagalan untuk LLM: `ERROR[kode]: <label>: <pesan>`. */
export function formatToolFailure(failure: ToolFailure, label?: string): string {
  return `ERROR[${failure.code}]: ${label ? `${label}: ` : ""}${failure.message}`
}

/** Bentuk respons tool dari outcome: sukses → `render(data)`, gagal → `formatToolFailure`. */
export function toToolResponse<T>(outcome: ToolOutcome<T>, render: (data: T) => string, failureLabel?: string): ToolResponse {
  return outcome.ok ? [render(outcome.data), outcome] : [formatToolFailure(outcome, failureLabel), outcome]
}

/** Artifact `ToolOutcome` yang valid dari hasil tool (ToolMessage); `undefined` untuk tool di luar kontrak. */
export function readToolArtifact(result: unknown): ToolArtifact | undefined {
  if (!ToolMessage.isInstance(result)) return undefined
  const parsed = ToolArtifactSchema.safeParse(result.artifact)
  if (!parsed.success) return undefined
  return parsed.data.ok ? { ok: true, data: parsed.data.data } : parsed.data
}

/** Sinyal pembatalan efektif sebuah pemanggilan tool: sinyal run (`ctx`) ATAU `config.signal` LangChain. */
export function resolveToolSignal(ctx: ToolRuntimeContext, config?: ToolRunnableConfig): AbortSignal | undefined {
  return anySignal(ctx.signal, config?.signal)
}

/**
 * Ringkasan telemetri satu baris dari outcome: kegagalan → kode + pesan; sukses → `render(data)` bila
 * data cocok dengan `schema`.
 */
export function summarizeToolOutcome<T>(outcome: ToolArtifact, schema: z.ZodType<T>, render: (data: T) => string): string {
  if (!outcome.ok) return `Gagal [${outcome.code}]: ${outcome.message}`
  const parsed = schema.safeParse(outcome.data)
  return parsed.success ? render(parsed.data) : "Tool selesai (data di luar kontrak)"
}
