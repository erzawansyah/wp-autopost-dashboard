import { WriterState } from "../types/engine"
import { WriterRequest, WriterError, NodeExecutionLog } from "../types/contracts"
import { LoadedPrompt, loadNodePrompt } from "./prompt-loader"
import { LlmServiceInterface } from "@/lib/ai/openrouter"

/**
 * Custom Error khusus node untuk mempermudah spesifikasi kode error dan retryability
 */
export class NodeError extends Error {
  code: string
  retryable: boolean

  constructor(message: string, code: string = "NODE_EXECUTION_ERROR", retryable: boolean = true) {
    super(message)
    this.name = "NodeError"
    this.code = code
    this.retryable = retryable
  }
}

/**
 * Konteks yang disuntikkan secara otomatis ke dalam fungsi `run` node
 */
export interface NodeExecutionContext<TState = WriterState> {
  prompt?: LoadedPrompt
  llm: LlmServiceInterface
  request: WriterRequest
  logMessage: (msg: string) => void
  addWarning: (warning: string) => void
}

/**
 * Konfigurasi deklaratif untuk pendefinisian node via `defineNode`
 */
export interface DefineNodeConfig<TState extends WriterState = WriterState> {
  /** Identifier unik node (misal: 'quality_checker', 'taxonomy_resolver') */
  id: string

  /** Label deskriptif untuk log telemetri browser (misal: 'Evaluasi Kelayakan & Mutu') */
  label: string

  /** Apakah node memanfaatkan model AI? Jika true, prompt.md akan dimuat secara otomatis */
  isAiNode?: boolean

  /** Nama folder berkas prompt jika berbeda dengan `id` (default: id diubah ke kebab-case) */
  promptNodeName?: string

  /** Ekstraktor input opsional untuk telemetri logging */
  extractLogInput?: (state: TState) => Record<string, unknown>

  /** Ekstraktor output opsional untuk telemetri logging */
  extractLogOutput?: (result: Partial<TState>) => Record<string, unknown>

  /**
   * Logika inti node. Developer hanya perlu fokus mengembalikan update state delta.
   * Urusan timer, logging telemetri, penanganan error, dan integrasi prompt ditangani otomatis.
   */
  run: (
    state: TState,
    context: NodeExecutionContext<TState>
  ) => Promise<Partial<TState>> | Partial<TState>
}

/**
 * Factory penentu node (Functional Factory Pattern) untuk System Writer.
 * Menghasilkan fungsi standar LangGraph `(state) => Promise<Partial<State>>` yang sepenuhnya
 * stateless, aman dari race-condition, serta bebas dari boilerplate timer dan error-handling.
 */
export function defineNode<TState extends WriterState = WriterState>(
  config: DefineNodeConfig<TState>
): (state: TState) => Promise<Partial<TState>> {
  const promptFolder = config.promptNodeName || config.id.replace(/_/g, "-")

  return async (state: TState): Promise<Partial<TState>> => {
    // 1. Guardrail: jika alur sebelumnya telah mengalami error, lewati node ini
    if (state.error) {
      return {}
    }

    const start = Date.now()
    const collectedWarnings: string[] = []
    let customLogMessage = ""

    // 2. Siapkan prompt template jika ini adalah node AI
    let prompt: LoadedPrompt | undefined
    if (config.isAiNode) {
      try {
        prompt = loadNodePrompt(promptFolder)
      } catch (promptErr) {
        console.warn(`[node-factory] Gagal memuat prompt.md untuk node "${config.id}":`, promptErr)
      }
    }

    const execContext: NodeExecutionContext<TState> = {
      prompt,
      llm: state.context?.llmService,
      request: state.context?.request,
      logMessage: (msg: string) => {
        customLogMessage = msg
      },
      addWarning: (warning: string) => {
        collectedWarnings.push(warning)
      },
    }

    // Ekstraksi data input untuk telemetri
    const logInput = config.extractLogInput
      ? config.extractLogInput(state)
      : {
          keyword: state.context?.request?.content?.keyword,
          title: state.rawTitle || state.context?.request?.content?.title,
        }

    try {
      // 3. Eksekusi logika inti pengembang
      const result = await config.run(state, execContext)
      const durationMs = Date.now() - start

      // Ekstraksi data output untuk telemetri
      const logOutput = config.extractLogOutput
        ? config.extractLogOutput(result)
        : result

      const defaultMessage = customLogMessage || `Selesai dalam ${durationMs}ms`

      // Buat entri log telemetri terstandarisasi
      const standardLog: NodeExecutionLog = {
        node: config.id,
        label: config.label,
        status: "success",
        durationMs,
        input: logInput,
        output: logOutput,
        message: defaultMessage,
        timestamp: new Date().toISOString(),
      }

      const allWarnings = [
        ...(state.warnings || []),
        ...collectedWarnings,
        ...(result.warnings || []),
      ]

      return {
        ...result,
        nodesExecuted: [config.id],
        nodeLogs: result.nodeLogs && result.nodeLogs.length > 0 ? result.nodeLogs : [standardLog],
        ...(allWarnings.length > 0 ? { warnings: allWarnings } : {}),
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - start

      let errorCode = "NODE_EXECUTION_ERROR"
      let errorMessage = "Terjadi kesalahan pada eksekusi node"
      let retryable = true

      if (err instanceof NodeError) {
        errorCode = err.code
        errorMessage = err.message
        retryable = err.retryable
      } else if (err instanceof Error) {
        errorMessage = err.message
      }

      console.error(`[Writer Node: ${config.id}] GAGAL: ${errorMessage} (${durationMs}ms)`)

      const errorObj: WriterError = {
        code: errorCode,
        message: errorMessage,
        node: config.id,
        retryable,
      }

      const errorLog: NodeExecutionLog = {
        node: config.id,
        label: config.label,
        status: "error",
        durationMs,
        input: logInput,
        output: { error: errorMessage, code: errorCode },
        message: `Gagal: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      }

      return {
        error: errorObj,
        nodesExecuted: [config.id],
        nodeLogs: [errorLog],
        ...(collectedWarnings.length > 0 ? { warnings: collectedWarnings } : {}),
      } as Partial<TState>
    }
  }
}
