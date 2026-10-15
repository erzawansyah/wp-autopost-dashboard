import "server-only"
import { z } from "zod"
import { publicEnvSchema, readPublicEnvSource } from "./client"
import { envFlag, envIntInRange, envText, httpUrlSchema, isIntInRange, type EnvSource } from "./shared"

/**
 * Lapisan env server bertipe (zod v4) — satu-satunya tempat kode server membaca `process.env`.
 *
 * - `serverEnv()` mem-parse ulang env di SETIAP pemanggilan (murah, tanpa cache modul) agar `vi.stubEnv`
 *   di test dan env runtime langsung berlaku. Fungsi ini tidak pernah melempar: nilai mentah dikembalikan
 *   apa adanya (string kosong → `undefined`), dan setiap pemakai tetap memegang validasi/pesan error miliknya.
 * - `validateServerEnv()` adalah pemeriksaan ketat yang dijalankan sekali saat server mulai
 *   (`src/instrumentation.ts`, bukan saat `next build`): di production masalah konfigurasi inti
 *   menggagalkan start, di luar production hanya peringatan. Laporan hanya memuat NAMA variabel.
 */

/** Daftar tertutup kunci API milik operator yang boleh menjadi cadangan kunci tenant (lihat `platform-keys.ts`). */
export const PLATFORM_KEY_ENV_NAMES = [
  "OPENROUTER_API_KEY",
  "PEXAFY_API_KEY",
  "BING_SEARCH_API_KEY",
  "BING_API_KEY",
] as const

/** Mode runner antrean: `embedded` (loop di proses Next.js ini) atau `off` (pemicu cron eksternal). */
export const QUEUE_RUNNER_MODES = ["embedded", "off"] as const
export type QueueRunnerMode = (typeof QUEUE_RUNNER_MODES)[number]

/** Batas & default tuning runner antrean (nilai di luar rentang → default + peringatan startup). */
export const QUEUE_ENV_LIMITS = {
  QUEUE_CONCURRENCY: { min: 1, max: 10, fallback: 3 },
  QUEUE_POLL_INTERVAL_MS: { min: 1_000, max: 600_000, fallback: 5_000 },
  QUEUE_LEASE_SECONDS: { min: 60, max: 3_600, fallback: 900 },
} as const

const queueRunnerMode = z
  .string()
  .optional()
  .transform((value): QueueRunnerMode => (value?.trim() === "off" ? "off" : "embedded"))

const queueInt = (name: keyof typeof QUEUE_ENV_LIMITS) => {
  const { min, max, fallback } = QUEUE_ENV_LIMITS[name]
  return envIntInRange(min, max, fallback)
}

const serverEnvObject = publicEnvSchema.extend({
  NODE_ENV: envText,
  /** Secret/Service Role key Supabase (bypass RLS) — hanya untuk queue worker & proses sistem. */
  SUPABASE_SECRET_KEY: envText,
  /** Alias lama; dipakai bila `SUPABASE_SECRET_KEY` kosong. */
  SUPABASE_SERVICE_ROLE_KEY: envText,
  /** 64 karakter hex (32 byte) untuk AES-256-GCM & HMAC state token. */
  ENCRYPTION_MASTER_KEY: envText,
  /**
   * Token pemicu cron `/api/queue/process` (header Bearer / x-cron-secret). Wajib di production hanya bila
   * `QUEUE_RUNNER=off` (antrean digerakkan cron eksternal); dengan runner tertanam cron opsional.
   */
  CRON_SECRET: envText,
  /** `embedded` (default): runner antrean berjalan di proses server ini. `off`: nonaktif (cron eksternal). */
  QUEUE_RUNNER: queueRunnerMode,
  /** Maksimum job antrean berjalan bersamaan per proses (1–10, default 3). */
  QUEUE_CONCURRENCY: queueInt("QUEUE_CONCURRENCY"),
  /** Jeda polling runner saat idle dalam ms (≥ 1000, default 5000). */
  QUEUE_POLL_INTERVAL_MS: queueInt("QUEUE_POLL_INTERVAL_MS"),
  /** Durasi lease item yang sedang dikerjakan dalam detik (≥ 60, default 900); diperpanjang heartbeat. */
  QUEUE_LEASE_SECONDS: queueInt("QUEUE_LEASE_SECONDS"),
  /** BYOK-only: kunci platform di bawah hanya dipakai bila nilainya persis `"true"`. */
  PLATFORM_KEY_ALLOWED: envFlag,
  OPENROUTER_API_KEY: envText,
  PEXAFY_API_KEY: envText,
  BING_SEARCH_API_KEY: envText,
  BING_API_KEY: envText,
  /** SearXNG internal platform (default `http://searxng-internal:8080`, lihat `safe-fetch.ts`). */
  SEARXNG_URL: envText,
  /** Buka akses jaringan privat untuk dev; selalu diabaikan di production. */
  ALLOW_PRIVATE_NETWORK_FETCH: envFlag,
  OPENROUTER_APP_NAME: envText,
  OPENROUTER_SITE_URL: envText,
  /** Model default runtime Agent Profile, worker, dan pengaturan pengguna. */
  OPENROUTER_DEFAULT_MODEL: envText,
  /** Model default `callOpenRouterJson` (WP Tools). */
  DEFAULT_AI_MODEL: envText,
  /** Kill switch operator: `"false"` mematikan seluruh tracing LangSmith (termasuk BYOK tenant). */
  LANGSMITH_TRACING: envText,
  LANGCHAIN_TRACING_V2: envText,
})

const serverEnvSchema = serverEnvObject.transform((env) => ({
  ...env,
  isProduction: env.NODE_ENV === "production",
  /** `SUPABASE_SECRET_KEY`, atau alias lama `SUPABASE_SERVICE_ROLE_KEY`. */
  supabaseServiceRoleKey: env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY,
}))

export type ServerEnvName = keyof typeof serverEnvObject.shape
export type ServerEnvInput = Partial<EnvSource<ServerEnvName>>
export type ServerEnv = z.output<typeof serverEnvSchema>

/**
 * Nilai mentah env server. Setiap variabel dirujuk LITERAL: `NEXT_PUBLIC_*` & `NODE_ENV` tetap
 * diinline Next.js saat build, variabel lain dibaca saat runtime.
 */
export function readServerEnvSource(): EnvSource<ServerEnvName> {
  return {
    ...readPublicEnvSource(),
    NODE_ENV: process.env.NODE_ENV,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    QUEUE_RUNNER: process.env.QUEUE_RUNNER,
    QUEUE_CONCURRENCY: process.env.QUEUE_CONCURRENCY,
    QUEUE_POLL_INTERVAL_MS: process.env.QUEUE_POLL_INTERVAL_MS,
    QUEUE_LEASE_SECONDS: process.env.QUEUE_LEASE_SECONDS,
    PLATFORM_KEY_ALLOWED: process.env.PLATFORM_KEY_ALLOWED,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    PEXAFY_API_KEY: process.env.PEXAFY_API_KEY,
    BING_SEARCH_API_KEY: process.env.BING_SEARCH_API_KEY,
    BING_API_KEY: process.env.BING_API_KEY,
    SEARXNG_URL: process.env.SEARXNG_URL,
    ALLOW_PRIVATE_NETWORK_FETCH: process.env.ALLOW_PRIVATE_NETWORK_FETCH,
    OPENROUTER_APP_NAME: process.env.OPENROUTER_APP_NAME,
    OPENROUTER_SITE_URL: process.env.OPENROUTER_SITE_URL,
    OPENROUTER_DEFAULT_MODEL: process.env.OPENROUTER_DEFAULT_MODEL,
    DEFAULT_AI_MODEL: process.env.DEFAULT_AI_MODEL,
    LANGSMITH_TRACING: process.env.LANGSMITH_TRACING,
    LANGCHAIN_TRACING_V2: process.env.LANGCHAIN_TRACING_V2,
  }
}

/** Env server bertipe, dibaca ulang setiap pemanggilan. Tidak pernah melempar. */
export function serverEnv(source: ServerEnvInput = readServerEnvSource()): ServerEnv {
  return serverEnvSchema.parse(source)
}

// ---------------------------------------------------------------------------
// Validasi ketat saat server mulai
// ---------------------------------------------------------------------------

const HEX_64 = /^[0-9a-fA-F]{64}$/
export const CRON_SECRET_MIN_LENGTH = 32
const FLAG_ENV_NAMES = ["PLATFORM_KEY_ALLOWED", "ALLOW_PRIVATE_NETWORK_FETCH"] as const

export interface EnvIssue {
  /** Nama variabel (alias dipisah " / "). Tidak pernah memuat nilai variabel. */
  variable: string
  message: string
}

export interface ServerEnvReport {
  isProduction: boolean
  /** Hanya terisi di production: konfigurasi inti hilang/tidak valid sehingga server wajib berhenti. */
  errors: EnvIssue[]
  warnings: EnvIssue[]
}

const isHttpUrl = (value: string): boolean => httpUrlSchema.safeParse(value).success

/**
 * Pemeriksaan ketat env server. Konfigurasi inti (Supabase, kunci enkripsi, mode runner antrean,
 * CRON_SECRET bila `QUEUE_RUNNER=off`, format URL) menjadi `errors` di production dan `warnings` di luar
 * production; saran lain selalu `warnings`.
 */
export function validateServerEnv(source: ServerEnvInput = readServerEnvSource()): ServerEnvReport {
  const env = serverEnv(source)
  const report: ServerEnvReport = { isProduction: env.isProduction, errors: [], warnings: [] }
  const required = (variable: string, message: string) =>
    (env.isProduction ? report.errors : report.warnings).push({ variable, message })
  const advise = (variable: string, message: string) => report.warnings.push({ variable, message })

  // 1. Supabase
  if (!env.NEXT_PUBLIC_SUPABASE_URL) {
    required("NEXT_PUBLIC_SUPABASE_URL", "wajib diisi (URL project Supabase, mis. https://xyz.supabase.co).")
  } else if (!isHttpUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
    required("NEXT_PUBLIC_SUPABASE_URL", "harus berupa URL http(s) yang valid.")
  }
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "salah satu wajib diisi (kunci publik Supabase untuk Auth SSR)."
    )
  }
  if (!env.supabaseServiceRoleKey) {
    required(
      "SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY",
      "salah satu wajib diisi (dipakai queue worker & proses sistem)."
    )
  } else if (
    env.SUPABASE_SECRET_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.SUPABASE_SECRET_KEY !== env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    advise(
      "SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY",
      "keduanya disetel dengan nilai berbeda; yang dipakai SUPABASE_SECRET_KEY."
    )
  }

  // 2. Kriptografi
  if (!env.ENCRYPTION_MASTER_KEY) {
    required("ENCRYPTION_MASTER_KEY", "wajib diisi (64 karakter hex / 32 byte) untuk enkripsi AES-256-GCM.")
  } else if (!HEX_64.test(env.ENCRYPTION_MASTER_KEY)) {
    required("ENCRYPTION_MASTER_KEY", "harus tepat 64 karakter hex (32 byte).")
  }

  // 3. Runner antrean & cron
  const rawQueueRunner = source.QUEUE_RUNNER?.trim()
  if (rawQueueRunner && !(QUEUE_RUNNER_MODES as readonly string[]).includes(rawQueueRunner)) {
    required("QUEUE_RUNNER", `harus salah satu dari: ${QUEUE_RUNNER_MODES.join(", ")} (default embedded).`)
  }
  for (const [name, { min, max, fallback }] of Object.entries(QUEUE_ENV_LIMITS)) {
    const raw = source[name as keyof typeof QUEUE_ENV_LIMITS]
    if (raw && !isIntInRange(raw, min, max)) {
      advise(name, `harus bilangan bulat ${min}–${max}; memakai default ${fallback}.`)
    }
  }
  const cronSecret = env.CRON_SECRET?.trim()
  if (!cronSecret) {
    if (env.QUEUE_RUNNER === "off") {
      required(
        "CRON_SECRET",
        "wajib diisi saat QUEUE_RUNNER=off; tanpa nilai ini semua pemicu cron ke /api/queue/process ditolak (401) dan antrean tidak berjalan."
      )
    }
  } else if (cronSecret.length < CRON_SECRET_MIN_LENGTH) {
    advise("CRON_SECRET", `disarankan minimal ${CRON_SECRET_MIN_LENGTH} karakter acak (mis. openssl rand -hex 32).`)
  }

  // 4. URL platform
  if (env.SEARXNG_URL && !isHttpUrl(env.SEARXNG_URL)) {
    required("SEARXNG_URL", "harus berupa URL http(s) yang valid.")
  }
  if (env.NEXT_PUBLIC_APP_URL) {
    if (!isHttpUrl(env.NEXT_PUBLIC_APP_URL)) required("NEXT_PUBLIC_APP_URL", "harus berupa URL http(s) yang valid.")
  } else if (env.isProduction) {
    advise(
      "NEXT_PUBLIC_APP_URL",
      "belum disetel; origin callback koneksi WordPress diambil dari header Host/X-Forwarded-Host."
    )
  }
  if (env.OPENROUTER_SITE_URL && !isHttpUrl(env.OPENROUTER_SITE_URL)) {
    advise("OPENROUTER_SITE_URL", "sebaiknya URL http(s) yang valid (dikirim sebagai HTTP-Referer ke OpenRouter).")
  }

  // 5. Flag boolean
  for (const name of FLAG_ENV_NAMES) {
    const raw = source[name]
    if (raw && raw !== "true" && raw !== "false") {
      advise(name, 'hanya nilai "true" yang mengaktifkan flag ini; nilai lain dianggap "false".')
    }
  }
  if (env.ALLOW_PRIVATE_NETWORK_FETCH && env.isProduction) {
    advise("ALLOW_PRIVATE_NETWORK_FETCH", "diabaikan di production (perlindungan Anti-SSRF tetap aktif).")
  }

  // 6. Kunci platform (BYOK-only)
  const configuredPlatformKeys = PLATFORM_KEY_ENV_NAMES.filter((name) => env[name])
  if (!env.PLATFORM_KEY_ALLOWED && configuredPlatformKeys.length > 0) {
    advise(configuredPlatformKeys.join(" / "), 'diabaikan karena PLATFORM_KEY_ALLOWED bukan "true" (BYOK-only).')
  }
  if (env.PLATFORM_KEY_ALLOWED && configuredPlatformKeys.length === 0) {
    advise("PLATFORM_KEY_ALLOWED", `bernilai "true" tetapi tidak ada kunci platform (${PLATFORM_KEY_ENV_NAMES.join(", ")}) yang disetel.`)
  }

  return report
}

/** Ringkasan laporan yang aman dicetak ke log: hanya nama variabel + aturan, tanpa nilai. */
export function formatServerEnvReport(report: ServerEnvReport): string {
  const mode = report.isProduction ? "production" : "non-production"
  const header =
    report.errors.length > 0
      ? `[env] Konfigurasi environment server tidak valid (${mode}); server dihentikan. / Invalid server environment.`
      : `[env] Peringatan konfigurasi environment server (${mode}). / Server environment warnings.`
  const lines = [
    header,
    ...report.errors.map((issue) => `  - [WAJIB] ${issue.variable}: ${issue.message}`),
    ...report.warnings.map((issue) => `  - [PERINGATAN] ${issue.variable}: ${issue.message}`),
  ]
  if (report.errors.length > 0) {
    lines.push("Perbaiki variabel di atas (lihat .env.example) lalu jalankan ulang server.")
  }
  return lines.join("\n")
}

/**
 * Dipanggil `register()` di `src/instrumentation.ts` saat server Node.js mulai.
 * Production + error → melempar (server gagal start); selain itu peringatan dicetak lewat `console.warn`.
 */
export function checkServerEnvOnStartup(source: ServerEnvInput = readServerEnvSource()): ServerEnvReport {
  const report = validateServerEnv(source)
  if (report.errors.length > 0) {
    throw new Error(formatServerEnvReport(report))
  }
  if (report.warnings.length > 0) {
    console.warn(formatServerEnvReport(report))
  }
  return report
}
