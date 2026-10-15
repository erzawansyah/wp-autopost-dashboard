import type { ClaimedQueueItem } from "@/core/queue/leases"
import { CLAIM_HEARTBEAT_INTERVAL_MS } from "@/core/queue/stale-recovery"

/**
 * Runner antrean di dalam proses Node.js yang berumur panjang (Docker), terlepas dari umur request HTTP.
 *
 * Satu loop per proses:
 *   1. auto-healing lease kedaluwarsa setiap `recoveryIntervalMs` (default 1 menit);
 *   2. klaim hingga (`concurrency` − job berjalan) item via `claim_post_items` (lease + batas per situs);
 *   3. setiap item dijalankan lewat jalur eksekusi worker; lease diperpanjang heartbeat berkala;
 *   4. tidur `pollIntervalMs` saat idle — `nudge()` atau job yang selesai membangunkan loop seketika.
 * Shutdown (`stop()`): berhenti mengklaim, tunggu job berjalan hingga batas waktu, lalu lepas lease item
 * yang belum selesai agar dapat diklaim ulang proses berikutnya.
 *
 * Semua akses data lewat `QueueBackend` (diinjeksi) sehingga runner dapat diuji dengan klaim & jam palsu.
 */

export interface QueueBackend {
  claim(input: { workerId: string; limit: number; leaseSeconds: number; userId?: string }): Promise<ClaimedQueueItem[]>
  run(item: ClaimedQueueItem, context: { workerId: string }): Promise<unknown>
  extendLease(input: { postId: string; workerId: string; leaseSeconds: number }): Promise<boolean>
  releaseLeases(input: { workerId: string; postIds: string[] }): Promise<unknown>
  recoverExpired(): Promise<unknown>
}

export interface QueueRunnerLogger {
  info(message: string): void
  warn(message: string, detail?: unknown): void
  error(message: string, detail?: unknown): void
}

export interface QueueRunnerOptions {
  workerId: string
  backend: QueueBackend
  /** Maksimum job berjalan bersamaan di proses ini. */
  concurrency: number
  /** Jeda polling saat idle (ms). */
  pollIntervalMs: number
  /** Durasi lease per klaim/heartbeat (detik). */
  leaseSeconds: number
  /** Interval heartbeat (ms). Default: min(60 detik, lease/3). */
  heartbeatIntervalMs?: number
  /** Interval auto-healing lease kedaluwarsa (ms). Default 60 detik. */
  recoveryIntervalMs?: number
  /** Batas umur satu job; setelahnya heartbeat berhenti & slot dibebaskan (job menggantung). */
  maxJobDurationMs?: number
  logger?: QueueRunnerLogger
}

export interface QueueRunnerStopReport {
  /** Job yang belum selesai saat batas waktu shutdown (lease-nya dilepas). */
  unfinished: number
}

interface RunningJob {
  item: ClaimedQueueItem
  startedAt: number
  leaseLost: boolean
  done: Promise<void>
}

type RunnerState = "idle" | "running" | "stopping" | "stopped"

const DEFAULT_RECOVERY_INTERVAL_MS = 60_000

const consoleLogger: QueueRunnerLogger = {
  info: (message) => console.info(message),
  warn: (message, detail) => (detail === undefined ? console.warn(message) : console.warn(message, detail)),
  error: (message, detail) => (detail === undefined ? console.error(message) : console.error(message, detail)),
}

/** Timer runner tidak boleh menahan proses tetap hidup (server HTTP yang menahannya). */
function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Saat database tidak terjangkau, kegagalan klaim beruntun hanya dicatat sesekali. */
const CLAIM_FAILURE_LOG_EVERY = 12

function unref(timer: unknown): void {
  if (typeof timer !== "object" || timer === null || !("unref" in timer)) return
  const { unref: release } = timer as { unref: unknown }
  if (typeof release === "function") release.call(timer)
}

export class QueueRunner {
  readonly workerId: string
  private readonly backend: QueueBackend
  private readonly concurrency: number
  private readonly pollIntervalMs: number
  private readonly leaseSeconds: number
  private readonly heartbeatIntervalMs: number
  private readonly recoveryIntervalMs: number
  private readonly maxJobDurationMs: number
  private readonly logger: QueueRunnerLogger

  private state: RunnerState = "idle"
  private readonly jobs = new Map<string, RunningJob>()
  private loopPromise: Promise<void> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatInFlight = false
  private wakeResolver: (() => void) | null = null
  private wakePending = false
  private lastRecoveryAt = Number.NEGATIVE_INFINITY
  private consecutiveClaimFailures = 0

  constructor(options: QueueRunnerOptions) {
    this.workerId = options.workerId
    this.backend = options.backend
    this.concurrency = Math.max(1, Math.floor(options.concurrency))
    this.pollIntervalMs = Math.max(1, options.pollIntervalMs)
    this.leaseSeconds = options.leaseSeconds
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? Math.min(CLAIM_HEARTBEAT_INTERVAL_MS, Math.floor((options.leaseSeconds * 1000) / 3))
    this.recoveryIntervalMs = options.recoveryIntervalMs ?? DEFAULT_RECOVERY_INTERVAL_MS
    this.maxJobDurationMs = options.maxJobDurationMs ?? Number.POSITIVE_INFINITY
    this.logger = options.logger ?? consoleLogger
  }

  get runningCount(): number {
    return this.jobs.size
  }

  get isRunning(): boolean {
    return this.state === "running"
  }

  /** Mulai loop polling (idempoten). */
  start(): void {
    if (this.state !== "idle") return
    this.state = "running"
    this.logger.info(
      `[queue-runner] Aktif (worker ${this.workerId}, konkurensi ${this.concurrency}, polling ${this.pollIntervalMs} ms, lease ${this.leaseSeconds} dtk).`
    )
    this.loopPromise = this.loop()
  }

  /** Bangunkan loop seketika (mis. setelah item baru diantrekan atau dijadwalkan ulang). */
  nudge(): void {
    this.wakePending = true
    const resolve = this.wakeResolver
    this.wakeResolver = null
    resolve?.()
  }

  /**
   * Satu siklus klaim tanpa loop (mode tanpa runner tertanam, mis. pemicu cron eksternal).
   * `recover` menjalankan auto-healing bila jatuh tempo (hanya pemicu sistem, karena lintas tenant).
   * Job diluncurkan di latar; tunggu dengan `drain()`.
   */
  async runCycle(options: { userId?: string; recover?: boolean } = {}): Promise<ClaimedQueueItem[]> {
    if (this.state === "stopping" || this.state === "stopped") return []
    if (options.recover) await this.recoverIfDue()
    return this.claimAndLaunch(options.userId)
  }

  /** Tunggu semua job berjalan selesai, dibatasi `timeoutMs`. `true` bila semuanya selesai. */
  async drain(timeoutMs: number = Number.POSITIVE_INFINITY): Promise<boolean> {
    const pending = Promise.allSettled([...this.jobs.values()].map((job) => job.done)).then(() => true)
    if (!Number.isFinite(timeoutMs)) return pending
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs))
      unref(timer)
    })
    try {
      return await Promise.race([pending, timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /**
   * Graceful shutdown: berhenti mengklaim, tunggu job berjalan hingga `timeoutMs`, lalu lepas lease
   * item yang belum selesai (dapat diklaim ulang proses lain). Idempoten.
   */
  async stop(options: { timeoutMs?: number } = {}): Promise<QueueRunnerStopReport> {
    if (this.state === "stopped") return { unfinished: 0 }
    this.state = "stopping"
    this.nudge()
    await this.loopPromise?.catch(() => {})

    const finished = await this.drain(options.timeoutMs ?? Number.POSITIVE_INFINITY)
    const unfinished = [...this.jobs.values()].map((job) => job.item)
    if (!finished && unfinished.length > 0) {
      this.logger.warn(
        `[queue-runner] Batas waktu shutdown tercapai; melepas lease ${unfinished.length} item yang belum selesai.`
      )
      await this.backend
        .releaseLeases({ workerId: this.workerId, postIds: unfinished.map((item) => item.id) })
        .catch((err: unknown) => this.logger.error("[queue-runner] Gagal melepas lease saat shutdown:", err))
    }
    this.stopHeartbeat()
    this.state = "stopped"
    this.logger.info(`[queue-runner] Berhenti (worker ${this.workerId}).`)
    return { unfinished: finished ? 0 : unfinished.length }
  }

  private async loop(): Promise<void> {
    while (this.state === "running") {
      this.wakePending = false
      await this.recoverIfDue()
      if (this.state !== "running") break
      await this.claimAndLaunch()
      if (this.state !== "running") break
      await this.waitForWake(this.pollIntervalMs)
    }
  }

  private async recoverIfDue(): Promise<void> {
    const now = Date.now()
    if (now - this.lastRecoveryAt < this.recoveryIntervalMs) return
    this.lastRecoveryAt = now
    try {
      await this.backend.recoverExpired()
    } catch (err) {
      this.logger.warn(`[queue-runner] Auto-healing lease kedaluwarsa gagal: ${describeError(err)}`)
    }
  }

  private async claimAndLaunch(userId?: string): Promise<ClaimedQueueItem[]> {
    const free = this.concurrency - this.jobs.size
    if (free <= 0) return []

    let items: ClaimedQueueItem[]
    try {
      items = await this.backend.claim({ workerId: this.workerId, limit: free, leaseSeconds: this.leaseSeconds, userId })
    } catch (err) {
      this.consecutiveClaimFailures++
      if (this.consecutiveClaimFailures % CLAIM_FAILURE_LOG_EVERY === 1) {
        this.logger.warn(
          `[queue-runner] Klaim antrean gagal (${this.consecutiveClaimFailures}x berturut-turut): ${describeError(err)}`
        )
      }
      return []
    }
    if (this.consecutiveClaimFailures > 0) {
      this.logger.info(`[queue-runner] Klaim antrean pulih setelah ${this.consecutiveClaimFailures} kegagalan.`)
      this.consecutiveClaimFailures = 0
    }

    // Shutdown dimulai saat klaim berjalan: jangan mulai pekerjaan baru, kembalikan item ke antrean.
    if (this.state === "stopping" || this.state === "stopped") {
      if (items.length > 0) {
        await this.backend
          .releaseLeases({ workerId: this.workerId, postIds: items.map((item) => item.id) })
          .catch((err: unknown) => this.logger.error("[queue-runner] Gagal melepas lease klaim terakhir:", err))
      }
      return []
    }

    for (const item of items) this.launch(item)
    return items
  }

  private launch(item: ClaimedQueueItem): void {
    const job: RunningJob = { item, startedAt: Date.now(), leaseLost: false, done: Promise.resolve() }
    job.done = this.backend
      .run(item, { workerId: this.workerId })
      .then(
        () => undefined,
        (err: unknown) => this.logger.error(`[queue-runner] Job ${item.id} gagal tak terduga:`, err)
      )
      .finally(() => {
        if (this.jobs.get(item.id) === job) this.jobs.delete(item.id)
        if (this.jobs.size === 0) this.stopHeartbeat()
        this.nudge()
      })
    this.jobs.set(item.id, job)
    this.ensureHeartbeat()
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer) return
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), this.heartbeatIntervalMs)
    unref(this.heartbeatTimer)
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return
    clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  private async heartbeat(): Promise<void> {
    if (this.heartbeatInFlight) return
    this.heartbeatInFlight = true
    try {
      const now = Date.now()
      const beats: Promise<void>[] = []
      for (const [postId, job] of this.jobs) {
        if (now - job.startedAt >= this.maxJobDurationMs) {
          // Job menggantung: bebaskan slot & hentikan heartbeat; lease kedaluwarsa → auto-healing.
          this.jobs.delete(postId)
          this.logger.error(
            `[queue-runner] Job ${postId} melebihi batas umur ${Math.round(this.maxJobDurationMs / 60_000)} menit; ` +
              "heartbeat dihentikan agar auto-healing memulihkannya."
          )
          this.nudge()
          continue
        }
        if (job.leaseLost) continue
        beats.push(
          this.backend
            .extendLease({ postId, workerId: this.workerId, leaseSeconds: this.leaseSeconds })
            .then((extended) => {
              if (!extended) {
                job.leaseLost = true
                this.logger.warn(
                  `[queue-runner] Lease item ${postId} sudah tidak dipegang worker ini; hasil run tidak akan menimpa klaim baru.`
                )
              }
            })
            .catch((err: unknown) =>
              this.logger.warn(`[queue-runner] Heartbeat item ${postId} gagal: ${describeError(err)}`)
            )
        )
      }
      await Promise.all(beats)
      if (this.jobs.size === 0) this.stopHeartbeat()
    } finally {
      this.heartbeatInFlight = false
    }
  }

  private waitForWake(ms: number): Promise<void> {
    if (this.wakePending) {
      this.wakePending = false
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wakeResolver = null
        resolve()
      }, ms)
      unref(timer)
      this.wakeResolver = () => {
        clearTimeout(timer)
        this.wakePending = false
        resolve()
      }
    })
  }
}
