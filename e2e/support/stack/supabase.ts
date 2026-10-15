import { execFile, spawn } from "node:child_process"
import { createWriteStream, mkdirSync } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"
import { E2E_PATHS } from "../config"
import { tailLog } from "./processes"

const execFileAsync = promisify(execFile)

/**
 * Supabase lokal (Supabase CLI + Docker) untuk E2E: dipakai ulang bila sudah berjalan, selain itu
 * `supabase start` (migrasi + seed diterapkan otomatis saat database pertama kali dibuat).
 *
 * Kunci yang dikembalikan adalah kunci demo bawaan Supabase CLI lokal; nilainya dibaca saat runtime dari
 * `supabase status` dan hanya diteruskan lewat environment proses — tidak pernah ditulis ke berkas.
 */

export interface LocalSupabase {
  apiUrl: string
  publishableKey: string
  secretKey: string
}

/**
 * Layanan yang tidak dipakai aplikasi/test (Studio, Storage, Edge Functions, analytics, pooler, mail)
 * dimatikan agar start lebih cepat dan ringan. Auth, PostgREST, Realtime, dan Kong tetap berjalan.
 */
const EXCLUDED_SERVICES = [
  "studio",
  "imgproxy",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
  "postgres-meta",
  "mailpit",
  "storage-api",
]

const START_TIMEOUT_MS = 15 * 60_000

function supabaseCli(args: string[]): [string, string[]] {
  return ["npx", ["--no-install", "supabase", ...args, "--workdir", E2E_PATHS.root]]
}

async function readStatus(): Promise<LocalSupabase | null> {
  const [command, args] = supabaseCli(["status", "-o", "json"])
  let stdout: string
  try {
    ;({ stdout } = await execFileAsync(command, args, { cwd: E2E_PATHS.root, maxBuffer: 1024 * 1024 }))
  } catch {
    return null // stack belum berjalan
  }
  const start = stdout.indexOf("{")
  if (start < 0) return null
  const status = JSON.parse(stdout.slice(start)) as Record<string, string | undefined>
  const apiUrl = status.API_URL
  const publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY
  const secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY
  if (!apiUrl || !publishableKey || !secretKey) return null
  return { apiUrl, publishableKey, secretKey }
}

async function startStack(): Promise<void> {
  const logFile = path.join(E2E_PATHS.logs, "supabase-start.log")
  mkdirSync(E2E_PATHS.logs, { recursive: true })
  const log = createWriteStream(logFile, { flags: "w" })
  const [command, args] = supabaseCli(["start", "--exclude", EXCLUDED_SERVICES.join(",")])
  const child = spawn(command, args, { cwd: E2E_PATHS.root, stdio: ["ignore", "pipe", "pipe"] })
  child.stdout.pipe(log)
  child.stderr.pipe(log)

  const code = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`supabase start melebihi ${START_TIMEOUT_MS / 60_000} menit. Log: ${logFile}`))
    }, START_TIMEOUT_MS)
    child.once("exit", (exitCode) => {
      clearTimeout(timer)
      resolve(exitCode)
    })
    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
  log.end()
  if (code !== 0) {
    throw new Error(`supabase start gagal (kode ${code}). Pastikan Docker berjalan. Log terakhir:\n${tailLog(logFile)}`)
  }
}

/** Hanya stack lokal: harness menghapus akun uji & memproses antrean, jadi tidak boleh menyentuh proyek remote. */
function assertLocalUrl(apiUrl: string): void {
  const { hostname } = new URL(apiUrl)
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname)) {
    throw new Error(`E2E hanya boleh memakai Supabase lokal, tetapi API_URL menunjuk ke ${hostname}.`)
  }
}

/**
 * Stack yang dipakai ulang tidak menjalankan migrasi baru secara otomatis (`supabase start` hanya menerapkan
 * migrasi saat database dibuat). Terapkan migrasi tertunda agar skema sama dengan kode yang diuji.
 */
async function applyPendingMigrations(): Promise<string> {
  const [command, args] = supabaseCli(["migration", "up", "--local"])
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { cwd: E2E_PATHS.root, maxBuffer: 1024 * 1024 })
    return `${stdout}${stderr}`.trim()
  } catch (error) {
    const output = error instanceof Error && "stderr" in error ? String(error.stderr) : String(error)
    throw new Error(`supabase migration up --local gagal:\n${output}`)
  }
}

export async function ensureLocalSupabase(): Promise<{ supabase: LocalSupabase; started: boolean; migrations: string }> {
  let status = await readStatus()
  let started = false
  if (!status) {
    await startStack()
    started = true
    status = await readStatus()
    if (!status) throw new Error("supabase start selesai tetapi `supabase status` tidak mengembalikan URL/kunci.")
  }
  assertLocalUrl(status.apiUrl)
  const migrations = started ? "" : await applyPendingMigrations()
  return { supabase: status, started, migrations }
}
