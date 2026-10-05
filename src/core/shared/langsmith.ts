import { Client } from "langsmith"
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain"
import { traceable } from "langsmith/traceable"
import { DecryptedUserKeys } from "@/types/settings"

export { traceable }

export interface LangSmithConfig {
  enabled: boolean
  apiKey?: string
  projectName: string
  endpoint: string
}

/**
 * Mengekstrak konfigurasi LangSmith dari database user (BYOK) atau environment variables sistem.
 */
export function getLangSmithConfig(userKeys?: DecryptedUserKeys): LangSmithConfig {
  const apiKey =
    userKeys?.langsmithApiKey ||
    process.env.LANGSMITH_API_KEY ||
    process.env.LANGCHAIN_API_KEY ||
    undefined

  const projectName =
    userKeys?.langsmithProject ||
    process.env.LANGSMITH_PROJECT ||
    process.env.LANGCHAIN_PROJECT ||
    "Panitera"

  const endpoint =
    process.env.LANGSMITH_ENDPOINT ||
    process.env.LANGCHAIN_ENDPOINT ||
    "https://api.smith.langchain.com"

  // Tracing aktif jika API key tersedia atau jika variabel tracing di-set eksplisit
  const isTracingExplicitlyDisabled =
    process.env.LANGSMITH_TRACING === "false" ||
    process.env.LANGCHAIN_TRACING_V2 === "false"

  const enabled = Boolean(apiKey && apiKey.trim().length > 0 && !isTracingExplicitlyDisabled)

  return {
    enabled,
    apiKey: apiKey?.trim(),
    projectName: projectName.trim(),
    endpoint: endpoint.trim(),
  }
}

/**
 * Mengatur environment variable proses untuk LangSmith Tracing secara dinamis per permintaan (BYOK support)
 */
export function setupLangSmithEnvironment(userKeys?: DecryptedUserKeys): LangSmithConfig {
  const config = getLangSmithConfig(userKeys)

  if (config.enabled && config.apiKey) {
    process.env.LANGSMITH_TRACING = "true"
    process.env.LANGCHAIN_TRACING_V2 = "true"
    process.env.LANGSMITH_API_KEY = config.apiKey
    process.env.LANGCHAIN_API_KEY = config.apiKey
    process.env.LANGSMITH_PROJECT = config.projectName
    process.env.LANGCHAIN_PROJECT = config.projectName
    process.env.LANGSMITH_ENDPOINT = config.endpoint
    process.env.LANGCHAIN_ENDPOINT = config.endpoint
    process.env.LANGCHAIN_CALLBACKS_BACKGROUND = "false"
  }

  return config
}

export interface CreateTracerOptions {
  userKeys?: DecryptedUserKeys
  projectName?: string
}

/**
 * Membuat instance LangChainTracer jika kredensial LangSmith tersedia.
 * Mengembalikan undefined jika LangSmith belum dikonfigurasi.
 */
export function createLangSmithTracer(options?: CreateTracerOptions): LangChainTracer | undefined {
  const config = getLangSmithConfig(options?.userKeys)

  if (!config.enabled || !config.apiKey) {
    return undefined
  }

  try {
    const client = new Client({
      apiKey: config.apiKey,
      apiUrl: config.endpoint,
    })

    const targetProject = options?.projectName || config.projectName

    return new LangChainTracer({
      projectName: targetProject,
      client,
    })
  } catch (err) {
    console.warn("[LangSmith] Gagal menginisialisasi LangChainTracer:", err)
    return undefined
  }
}

/**
 * Memastikan semua batch trace yang tertunda terkirim tuntas ke LangSmith
 */
export async function flushLangSmithTracer(tracer?: LangChainTracer): Promise<void> {
  if (!tracer) return
  try {
    const client = tracer.client as Client | undefined
    if (client && typeof client.awaitPendingTraceBatches === "function") {
      await client.awaitPendingTraceBatches()
    }
  } catch (err) {
    console.warn("[LangSmith] Warning saat flush tracer batches:", err)
  }
}

