import type { AgentRunInfo, CheckpointStep } from "@/types/posts"

/**
 * Format metrik Agent Profile run untuk detail artikel (biaya, token, durasi, langkah checkpoint) — modul murni.
 */

const usdFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
})

const integerFormatter = new Intl.NumberFormat("id-ID")

/** Biaya USD; `null`/tidak valid → "tidak dilaporkan" (provider tidak mengirim `usage.cost`). */
export function formatUsd(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "tidak dilaporkan"
  const amount = typeof value === "number" ? value : Number(value)
  return Number.isFinite(amount) ? usdFormatter.format(amount) : "tidak dilaporkan"
}

export function formatCount(value: number | null | undefined): string {
  return integerFormatter.format(value ?? 0)
}

/** Durasi ms → "850 ms" / "12,4 dtk" / "3 mnt 05 dtk". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—"
  if (ms < 1_000) return `${Math.round(ms)} ms`
  const seconds = ms / 1_000
  if (seconds < 60) return `${seconds.toLocaleString("id-ID", { maximumFractionDigits: 1 })} dtk`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds - minutes * 60)
  return `${minutes} mnt ${String(rest).padStart(2, "0")} dtk`
}

export const CHECKPOINT_STEP_LABELS: Record<CheckpointStep, string> = {
  pre_resolve: "Taksonomi & author",
  draft: "Draf naskah",
}

export function checkpointStepLabel(step: string): string {
  return step in CHECKPOINT_STEP_LABELS ? CHECKPOINT_STEP_LABELS[step as CheckpointStep] : step
}

const STOP_REASON_LABELS: Record<string, string> = {
  completed: "Selesai normal",
  limit_reached: "Batas eksekusi tercapai (finalisasi)",
  llm_auth_failed: "Kunci OpenRouter ditolak",
  llm_quota_exhausted: "Kuota/kredit OpenRouter habis",
  lease_expired: "Lease kedaluwarsa",
  lease_lost: "Klaim diambil alih proses lain",
  claim_lost: "Klaim ditolak (checkpoint)",
  max_duration: "Melewati batas durasi",
  shutdown: "Server dimatikan",
  superseded: "Digantikan percobaan baru",
}

/** Alasan berhenti run → label Indonesia (nilai tak dikenal ditampilkan apa adanya). */
export function stopReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null
  return STOP_REASON_LABELS[reason] ?? reason
}

/** Label mode Agent Profile dari snapshot run. */
export function agentModeLabel(run: Pick<AgentRunInfo, "profile_snapshot"> | null | undefined): string {
  return run?.profile_snapshot?.mode === "deep" ? "Deep Agent" : "Standard Agent"
}
