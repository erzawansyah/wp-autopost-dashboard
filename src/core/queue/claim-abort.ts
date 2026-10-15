/**
 * Alasan pembatalan run yang memegang klaim antrean, dipakai sebagai `AbortSignal.reason`:
 * - runner: heartbeat memastikan lease hilang (`lease_lost`), job melewati batas umur (`max_duration`),
 *   klaim dicabut saat shutdown (`shutdown`);
 * - worker: penyimpanan checkpoint berpagar ditolak karena klaim sudah berpindah (`claim_lost`).
 * Kode alasan dicatat ke `agent_runs.stop_reason`. Gangguan sementara (mis. RPC heartbeat gagal karena
 * jaringan) BUKAN alasan pembatalan.
 */

export type ClaimAbortCode = "lease_lost" | "max_duration" | "shutdown" | "claim_lost"

const CLAIM_ABORT_MESSAGES: Record<ClaimAbortCode, string> = {
  lease_lost: "Lease item sudah tidak dipegang worker ini (dipulihkan otomatis atau diklaim ulang).",
  max_duration: "Run melewati batas umur job; lease dilepas agar auto-healing memulihkan item.",
  shutdown: "Runner antrean berhenti (restart/deploy) dan klaim item dicabut.",
  claim_lost: "Penyimpanan checkpoint ditolak karena klaim item sudah berpindah.",
}

export class ClaimAbortedError extends Error {
  readonly code: ClaimAbortCode

  constructor(code: ClaimAbortCode) {
    super(CLAIM_ABORT_MESSAGES[code])
    this.name = "ClaimAbortedError"
    this.code = code
  }
}

/** Kode alasan dari sinyal klaim yang sudah batal; `null` bila belum batal (alasan asing → `claim_lost`). */
export function claimAbortCode(signal: AbortSignal): ClaimAbortCode | null {
  if (!signal.aborted) return null
  return signal.reason instanceof ClaimAbortedError ? signal.reason.code : "claim_lost"
}

/** Pesan siap tampil untuk kode alasan pembatalan klaim. */
export function describeClaimAbort(code: ClaimAbortCode): string {
  return CLAIM_ABORT_MESSAGES[code]
}
