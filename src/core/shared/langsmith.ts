import { Client } from "langsmith"
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain"
import { serverEnv } from "@/lib/env/server"
import { DecryptedUserKeys } from "@/types/settings"

/**
 * Tracing LangSmith per-tenant (BYOK) yang terisolasi.
 *
 * Aturan keamanan multi-tenant:
 * - Modul ini TIDAK PERNAH menulis ke `process.env`. Kunci LangSmith milik satu tenant
 *   hanya hidup di instance `Client` milik run tersebut dan dioper lewat `callbacks`.
 * - Tracer hanya dibuat bila tenant menyimpan API key LangSmith miliknya sendiri.
 *   Tidak ada fallback ke `LANGSMITH_API_KEY` / `LANGCHAIN_API_KEY` sistem: tracing global
 *   operator (via env) tetap menjadi urusan konfigurasi LangChain bawaan, bukan kode ini.
 */

const DEFAULT_PROJECT_NAME = "panitera"
const LANGSMITH_API_URL = "https://api.smith.langchain.com"
const FLUSH_TIMEOUT_MS = 5_000

/**
 * Kill switch operator: `LANGSMITH_TRACING=false` / `LANGCHAIN_TRACING_V2=false`
 * mematikan seluruh tracing (termasuk BYOK tenant). Hanya dibaca, tidak pernah ditulis.
 */
function isTracingDisabledByOperator(): boolean {
  const env = serverEnv()
  return env.LANGSMITH_TRACING === "false" || env.LANGCHAIN_TRACING_V2 === "false"
}

/**
 * Membuat `LangChainTracer` khusus satu run untuk tenant yang memiliki API key LangSmith sendiri.
 * Mengembalikan `undefined` bila tenant tidak mengonfigurasi LangSmith atau tracing dimatikan operator.
 */
export function createTenantLangSmithTracer(
  userKeys?: Pick<DecryptedUserKeys, "langsmithApiKey" | "langsmithProject">,
): LangChainTracer | undefined {
  const apiKey = userKeys?.langsmithApiKey?.trim()
  if (!apiKey || isTracingDisabledByOperator()) return undefined

  const projectName = userKeys?.langsmithProject?.trim() || DEFAULT_PROJECT_NAME

  try {
    const client = new Client({ apiKey, apiUrl: LANGSMITH_API_URL })
    return new LangChainTracer({
      client,
      projectName,
      // Handler di-await inline (setara LANGCHAIN_CALLBACKS_BACKGROUND=false) khusus tracer ini,
      // sehingga flush di akhir run cukup memanggil awaitPendingTraceBatches() milik client sendiri.
      _awaitHandler: true,
    })
  } catch (err) {
    console.warn(
      "[LangSmith] Gagal menginisialisasi tracer tenant:",
      err instanceof Error ? err.message : "unknown error",
    )
    return undefined
  }
}

function hasAwaitPendingTraceBatches(
  client: unknown,
): client is Pick<Client, "awaitPendingTraceBatches"> {
  return (
    typeof client === "object" &&
    client !== null &&
    typeof (client as { awaitPendingTraceBatches?: unknown }).awaitPendingTraceBatches === "function"
  )
}

/**
 * Mengirim tuntas batch trace yang tertunda milik tracer tenant.
 * Dibatasi timeout agar LangSmith yang lambat/down tidak menahan worker; error hanya dicatat sebagai warning.
 */
export async function flushLangSmithTracer(tracer?: LangChainTracer): Promise<void> {
  if (!tracer) return

  const client: unknown = tracer.client
  if (!hasAwaitPendingTraceBatches(client)) return

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      client.awaitPendingTraceBatches(),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`[LangSmith] Flush trace melewati ${FLUSH_TIMEOUT_MS}ms, dilanjutkan tanpa menunggu.`)
          resolve()
        }, FLUSH_TIMEOUT_MS)
      }),
    ])
  } catch (err) {
    console.warn(
      "[LangSmith] Warning saat flush trace batches:",
      err instanceof Error ? err.message : "unknown error",
    )
  } finally {
    if (timer) clearTimeout(timer)
  }
}
