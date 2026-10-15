import { describe, expect, it } from "vitest"
import { nextQueuedPostNotice } from "./queued-post-notice-state"

const POST_ID = "11111111-1111-4111-8111-111111111111"

describe("nextQueuedPostNotice", () => {
  it("diinisialisasi dari payload redirect", () => {
    expect(nextQueuedPostNotice(null, { keyword: "Kopi", postId: POST_ID })).toMatchObject({ keyword: "Kopi", postId: POST_ID })
    expect(nextQueuedPostNotice(null, null)).toBeNull()
  })

  it("bertahan saat render ulang tanpa parameter (URL sudah dibersihkan / router.refresh)", () => {
    const shown = nextQueuedPostNotice(null, { keyword: "Kopi", postId: POST_ID })
    expect(nextQueuedPostNotice(shown, null)).toBe(shown)
  })

  it("payload yang sama tidak membuat banner baru; artikel lain menggantikannya", () => {
    const shown = nextQueuedPostNotice(null, { keyword: "Kopi", postId: POST_ID })
    expect(nextQueuedPostNotice(shown, { keyword: "Kopi", postId: POST_ID })).toBe(shown)

    const next = nextQueuedPostNotice(shown, { keyword: "Teh" })
    expect(next).toMatchObject({ keyword: "Teh", postId: undefined })
    expect(next?.key).not.toBe(shown?.key)
  })
})
