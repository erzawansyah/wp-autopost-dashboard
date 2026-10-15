import { spawn, type ChildProcess } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs"
import net from "node:net"
import path from "node:path"

/**
 * Proses latar milik harness E2E (WordPress Playground, `next dev`): log ke berkas, dijalankan sebagai
 * process group tersendiri (`detached`) agar seluruh turunan `npx`/Turbopack ikut dihentikan saat teardown.
 */

export interface ManagedProcess {
  readonly name: string
  readonly logFile: string
  /** Kode keluar / sinyal bila proses sudah berhenti, `undefined` bila masih berjalan. */
  exitStatus(): string | undefined
  stop(): Promise<void>
}

interface StartOptions {
  cwd: string
  env: NodeJS.ProcessEnv
  logFile: string
}

const STOP_GRACE_MS = 10_000

export function startProcess(name: string, command: string, args: string[], options: StartOptions): ManagedProcess {
  mkdirSync(path.dirname(options.logFile), { recursive: true })
  const log = createWriteStream(options.logFile, { flags: "w" })
  const child: ChildProcess = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout?.pipe(log)
  child.stderr?.pipe(log)

  let status: string | undefined
  const exited = new Promise<void>((resolve) => {
    child.once("exit", (code, signal) => {
      status = signal ? `sinyal ${signal}` : `kode ${code}`
      resolve()
    })
    child.once("error", (error) => {
      status = `gagal dijalankan: ${error.message}`
      resolve()
    })
  })

  /** `false` bila group proses sudah tidak ada (atau sinyal tidak dapat dikirim). */
  const signalGroup = (signal: NodeJS.Signals | 0): boolean => {
    if (child.pid === undefined) return false
    try {
      process.kill(-child.pid, signal)
      return true
    } catch {
      return false
    }
  }

  return {
    name,
    logFile: options.logFile,
    exitStatus: () => status,
    async stop() {
      if (signalGroup("SIGTERM")) {
        // Tunggu SELURUH group (bukan hanya parent `npx`) agar turunan sempat membersihkan berkas sementaranya.
        const deadline = Date.now() + STOP_GRACE_MS
        while (signalGroup(0) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 200))
        }
        signalGroup("SIGKILL")
      }
      await exited
      log.end()
    },
  }
}

export function tailLog(logFile: string, lines = 40): string {
  if (!existsSync(logFile)) return "(log kosong)"
  return readFileSync(logFile, "utf8").trimEnd().split("\n").slice(-lines).join("\n")
}

/** Gagal cepat bila port sudah dipakai proses lain (mis. sisa run sebelumnya). */
export async function assertPortFree(port: number, owner: string): Promise<void> {
  const inUse = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
  })
  if (inUse) {
    throw new Error(
      `Port ${port} (${owner}) sudah dipakai proses lain. Hentikan proses tersebut atau pilih port lain lewat env E2E_*_PORT.`
    )
  }
}

interface WaitOptions {
  timeoutMs: number
  /** Proses yang ditunggu: bila berhenti lebih dulu, gagal cepat dengan potongan log-nya. */
  process?: ManagedProcess
  ready?: (response: Response) => boolean | Promise<boolean>
  headers?: Record<string, string>
}

export async function waitForHttp(url: string, options: WaitOptions): Promise<void> {
  const deadline = Date.now() + options.timeoutMs
  let lastError = "belum ada respons"
  while (Date.now() < deadline) {
    const exit = options.process?.exitStatus()
    if (options.process && exit !== undefined) {
      throw new Error(
        `${options.process.name} berhenti (${exit}) sebelum siap. Log terakhir (${options.process.logFile}):\n` +
          tailLog(options.process.logFile)
      )
    }
    try {
      const response = await fetch(url, { headers: options.headers, signal: AbortSignal.timeout(10_000) })
      if (options.ready ? await options.ready(response) : response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  const logHint = options.process ? `\nLog terakhir (${options.process.logFile}):\n${tailLog(options.process.logFile)}` : ""
  throw new Error(`Timeout menunggu ${url} (${lastError}).${logHint}`)
}
