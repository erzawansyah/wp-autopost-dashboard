import { randomBytes } from "node:crypto"
import path from "node:path"
import { APP_PORT, APP_URL, E2E_PATHS } from "../config"
import type { LocalSupabase } from "./supabase"
import { assertPortFree, startProcess, waitForHttp, type ManagedProcess } from "./processes"

/**
 * Aplikasi yang diuji: `next dev` (bukan `next start`). Di production (`NODE_ENV=production`, diinline saat
 * build) aplikasi sengaja menolak URL WordPress http:// dan alamat jaringan privat/loopback — termasuk
 * Playground di 127.0.0.1 — dan `ALLOW_PRIVATE_NETWORK_FETCH` diabaikan (`src/lib/net/safe-fetch.ts`).
 *
 * Seluruh variabel yang dibaca `src/lib/env/server.ts` diisi eksplisit: Next.js tidak menimpa variabel
 * yang sudah ada di environment proses dengan isi `.env.local`, sehingga konfigurasi lokal pengembang
 * (Supabase remote, kunci platform, LangSmith) tidak pernah ikut terbawa ke E2E.
 */

const BOOT_TIMEOUT_MS = 4 * 60_000

/**
 * Penanda agen AI yang dibaca `@vercel/detect-agent`: bila ada, `next dev` membuat/menulis `AGENTS.md` di root
 * repo. Harness tidak boleh mengubah working tree, jadi penanda ini dibuang dari env aplikasi uji.
 */
const AGENT_DETECTION_ENV = /^(AI_AGENT|CLAUDECODE|CLAUDE_CODE.*|CURSOR_.*|CODEX_.*|GEMINI_CLI|COPILOT_.*|AUGMENT_AGENT|ANTIGRAVITY_AGENT|OPENCODE_CLIENT|REPL_ID)$/

function inheritedEnv(): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !AGENT_DETECTION_ENV.test(name)))
}

function appEnv(supabase: LocalSupabase): NodeJS.ProcessEnv {
  return {
    ...inheritedEnv(),
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    // Supabase lokal
    NEXT_PUBLIC_SUPABASE_URL: supabase.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_SECRET_KEY: supabase.secretKey,
    SUPABASE_SERVICE_ROLE_KEY: "",
    // Kunci acak per run (kredensial WP & BYOK uji hanya hidup selama run ini).
    ENCRYPTION_MASTER_KEY: randomBytes(32).toString("hex"),
    CRON_SECRET: randomBytes(32).toString("hex"),
    NEXT_PUBLIC_APP_URL: APP_URL,
    // Runner antrean tertanam dengan polling cepat agar item hasil seed langsung diklaim.
    QUEUE_RUNNER: "embedded",
    QUEUE_CONCURRENCY: "3",
    QUEUE_POLL_INTERVAL_MS: "1000",
    QUEUE_LEASE_SECONDS: "120",
    // WordPress Playground berjalan di loopback (diabaikan aplikasi bila NODE_ENV=production).
    ALLOW_PRIVATE_NETWORK_FETCH: "true",
    // BYOK-only tanpa cadangan kunci platform: test "tanpa kunci" harus gagal dengan pesan BYOK.
    PLATFORM_KEY_ALLOWED: "false",
    OPENROUTER_API_KEY: "",
    PEXAFY_API_KEY: "",
    BING_SEARCH_API_KEY: "",
    BING_API_KEY: "",
    OPENROUTER_DEFAULT_MODEL: "",
    DEFAULT_AI_MODEL: "",
    OPENROUTER_APP_NAME: "Panitera E2E",
    OPENROUTER_SITE_URL: APP_URL,
    SEARXNG_URL: "http://searxng-internal:8080",
    SEARXNG_SECRET: "e2e-dummy",
    LANGSMITH_TRACING: "false",
    LANGCHAIN_TRACING_V2: "false",
    LANGSMITH_API_KEY: "",
    LANGCHAIN_API_KEY: "",
  }
}

export async function startNextApp(supabase: LocalSupabase): Promise<ManagedProcess> {
  await assertPortFree(APP_PORT, "Next.js")
  const app = startProcess("next dev", process.execPath, [E2E_PATHS.nextBin, "dev", "--port", String(APP_PORT)], {
    cwd: E2E_PATHS.root,
    env: appEnv(supabase),
    logFile: path.join(E2E_PATHS.logs, "next.log"),
  })
  try {
    await waitForHttp(`${APP_URL}/api/health`, { timeoutMs: BOOT_TIMEOUT_MS, process: app })
    return app
  } catch (error) {
    await app.stop()
    throw error
  }
}
