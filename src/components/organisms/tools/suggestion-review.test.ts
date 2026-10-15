import { describe, expect, it } from "vitest"
import {
  approvableIndices,
  entryOf,
  summarizeReview,
  suggestionReviewReducer,
  type SuggestionReviewAction,
  type SuggestionReviewState,
} from "./suggestion-review"

function run(actions: SuggestionReviewAction[], initial: SuggestionReviewState = {}): SuggestionReviewState {
  return actions.reduce(suggestionReviewReducer, initial)
}

describe("suggestionReviewReducer", () => {
  it("idle → pending → approved menyimpan ID WordPress", () => {
    const state = run([
      { type: "start", index: 0 },
      { type: "succeed", index: 0, wpId: 77 },
    ])
    expect(entryOf(state, 0)).toEqual({ status: "approved", rejected: false, wpId: 77 })
  })

  it("gagal → error dengan pesan; boleh dicoba lagi (start menghapus pesan)", () => {
    const failed = run([
      { type: "start", index: 1 },
      { type: "fail", index: 1, error: "Slug sudah dipakai." },
    ])
    expect(entryOf(failed, 1)).toMatchObject({ status: "error", error: "Slug sudah dipakai." })
    expect(entryOf(run([{ type: "start", index: 1 }], failed), 1)).toEqual({ status: "pending", rejected: false })
  })

  it("item yang sedang diproses, sudah dibuat, atau ditolak tidak bisa di-start ulang", () => {
    const pending = run([{ type: "start", index: 0 }])
    expect(suggestionReviewReducer(pending, { type: "start", index: 0 })).toBe(pending)

    const approved = run([{ type: "succeed", index: 0 }])
    expect(suggestionReviewReducer(approved, { type: "start", index: 0 })).toBe(approved)

    const rejected = run([{ type: "reject", index: 0 }])
    expect(suggestionReviewReducer(rejected, { type: "start", index: 0 })).toBe(rejected)
  })

  it("tolak & pulihkan; item pending/approved tidak bisa ditolak", () => {
    const rejected = run([{ type: "reject", index: 2 }])
    expect(entryOf(rejected, 2).rejected).toBe(true)
    expect(entryOf(run([{ type: "restore", index: 2 }], rejected), 2).rejected).toBe(false)

    const pending = run([{ type: "start", index: 0 }])
    expect(suggestionReviewReducer(pending, { type: "reject", index: 0 })).toBe(pending)
    const approved = run([{ type: "succeed", index: 0 }])
    expect(suggestionReviewReducer(approved, { type: "reject", index: 0 })).toBe(approved)
  })
})

describe("approvableIndices & summarizeReview", () => {
  it("menghitung sisa yang bisa disetujui sesuai urutan asli", () => {
    const state = run([
      { type: "succeed", index: 0 },
      { type: "reject", index: 1 },
      { type: "start", index: 2 },
      { type: "start", index: 3 },
      { type: "fail", index: 3, error: "x" },
    ])
    expect(approvableIndices(state, 5)).toEqual([3, 4])
    expect(summarizeReview(state, 5)).toEqual({ total: 5, approved: 1, rejected: 1, pending: 1, remaining: 2 })
  })
})
