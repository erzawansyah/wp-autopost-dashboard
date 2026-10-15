/**
 * State murni alur persetujuan rekomendasi AI (kategori & persona author): setiap item hasil satu run AI
 * (dikunci indeks) bisa disetujui (ditulis ke WordPress), ditolak, atau dipulihkan. Diuji di
 * `suggestion-review.test.ts`; dipakai `useSuggestionReview`.
 */

type SuggestionStatus = "idle" | "pending" | "approved" | "error"

export interface SuggestionEntry {
  status: SuggestionStatus
  rejected: boolean
  /** Pesan aman untuk pengguna saat `status === "error"`. */
  error?: string
  /** ID objek WordPress yang dibuat (term/user) saat `status === "approved"`. */
  wpId?: number
}

export type SuggestionReviewState = Readonly<Record<number, SuggestionEntry>>

export type SuggestionReviewAction =
  | { type: "start"; index: number }
  | { type: "succeed"; index: number; wpId?: number }
  | { type: "fail"; index: number; error: string }
  | { type: "reject"; index: number }
  | { type: "restore"; index: number }

const IDLE_ENTRY: SuggestionEntry = { status: "idle", rejected: false }

export function entryOf(state: SuggestionReviewState, index: number): SuggestionEntry {
  return state[index] ?? IDLE_ENTRY
}

/** Item yang masih bisa disetujui: tidak ditolak, belum dibuat, dan tidak sedang diproses. */
export function canApprove(entry: SuggestionEntry): boolean {
  return !entry.rejected && (entry.status === "idle" || entry.status === "error")
}

export function suggestionReviewReducer(state: SuggestionReviewState, action: SuggestionReviewAction): SuggestionReviewState {
  const current = entryOf(state, action.index)
  switch (action.type) {
    case "start":
      if (!canApprove(current)) return state
      return { ...state, [action.index]: { status: "pending", rejected: false } }
    case "succeed":
      return { ...state, [action.index]: { status: "approved", rejected: false, wpId: action.wpId } }
    case "fail":
      return { ...state, [action.index]: { status: "error", rejected: false, error: action.error } }
    case "reject":
      if (current.status === "pending" || current.status === "approved" || current.rejected) return state
      return { ...state, [action.index]: { ...current, rejected: true } }
    case "restore":
      if (!current.rejected) return state
      return { ...state, [action.index]: { ...current, rejected: false } }
  }
}

/** Indeks `0..count-1` yang masih bisa disetujui (urutan asli). */
export function approvableIndices(state: SuggestionReviewState, count: number): number[] {
  const indices: number[] = []
  for (let index = 0; index < count; index++) {
    if (canApprove(entryOf(state, index))) indices.push(index)
  }
  return indices
}

export interface SuggestionReviewSummary {
  total: number
  approved: number
  rejected: number
  pending: number
  /** Masih bisa disetujui (idle/error, tidak ditolak). */
  remaining: number
}

export function summarizeReview(state: SuggestionReviewState, count: number): SuggestionReviewSummary {
  const summary: SuggestionReviewSummary = { total: count, approved: 0, rejected: 0, pending: 0, remaining: 0 }
  for (let index = 0; index < count; index++) {
    const entry = entryOf(state, index)
    if (entry.rejected) summary.rejected++
    else if (entry.status === "approved") summary.approved++
    else if (entry.status === "pending") summary.pending++
    else summary.remaining++
  }
  return summary
}
