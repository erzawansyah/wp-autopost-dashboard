import { describe, expect, it } from "vitest"
import {
  MAX_STALE_GENERATION_ATTEMPTS,
  decideStaleRecovery,
  isStaleRecoverableState,
} from "@/core/queue/stale-recovery"

describe("decideStaleRecovery", () => {
  it("syncing_to_wp yang stale menjadi failed_sync (tidak pernah generate ulang)", () => {
    for (const retryCount of [null, 0, 5]) {
      const decision = decideStaleRecovery({ state: "syncing_to_wp", retryCount })
      expect(decision.state).toBe("failed_sync")
      expect(decision.retryCount).toBe((retryCount ?? 0) + 1)
      expect(decision.lastError).toMatch(/tidak akan digenerasi ulang/)
    }
  })

  it("generating_content diantrekan ulang dengan retry_count bertambah selama di bawah batas", () => {
    const first = decideStaleRecovery({ state: "generating_content", retryCount: null })
    expect(first).toMatchObject({ state: "queued_input", retryCount: 1 })

    const second = decideStaleRecovery({ state: "generating_content", retryCount: 1 })
    expect(second).toMatchObject({ state: "queued_input", retryCount: 2 })
    expect(second.lastError).toContain(`percobaan 2 dari ${MAX_STALE_GENERATION_ATTEMPTS}`)
  })

  it("generating_content berhenti di failed_generation setelah batas percobaan", () => {
    const decision = decideStaleRecovery({
      state: "generating_content",
      retryCount: MAX_STALE_GENERATION_ATTEMPTS - 1,
    })
    expect(decision.state).toBe("failed_generation")
    expect(decision.retryCount).toBe(MAX_STALE_GENERATION_ATTEMPTS)
    expect(decision.lastError).toMatch(/dihentikan otomatis/)

    expect(decideStaleRecovery({ state: "generating_content", retryCount: 10 }).state).toBe("failed_generation")
  })

  it("menghormati batas kustom dan menormalkan retry_count negatif", () => {
    expect(decideStaleRecovery({ state: "generating_content", retryCount: 0 }, 1).state).toBe("failed_generation")
    expect(decideStaleRecovery({ state: "generating_content", retryCount: -4 })).toMatchObject({
      state: "queued_input",
      retryCount: 1,
    })
  })
})

describe("isStaleRecoverableState", () => {
  it("hanya mengenali state transien", () => {
    expect(isStaleRecoverableState("generating_content")).toBe(true)
    expect(isStaleRecoverableState("syncing_to_wp")).toBe(true)
    expect(isStaleRecoverableState("queued_input")).toBe(false)
    expect(isStaleRecoverableState("failed_sync")).toBe(false)
  })
})
