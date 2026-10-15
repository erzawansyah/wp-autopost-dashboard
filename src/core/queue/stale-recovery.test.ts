import { describe, expect, it } from "vitest"
import settingsConfig from "@/core/shared/settings.json"
import {
  CLAIM_HEARTBEAT_INTERVAL_MS,
  CLAIM_HEARTBEAT_MAX_LIFETIME_MS,
  MAX_STALE_GENERATION_ATTEMPTS,
  STALE_CLAIM_THRESHOLD_MS,
  decideStaleRecovery,
  isStaleRecoverableState,
} from "@/core/queue/stale-recovery"

describe("ambang stale & heartbeat klaim", () => {
  it("ambang stale minimal 15 menit dan di atas timeout agen maksimum", () => {
    expect(STALE_CLAIM_THRESHOLD_MS).toBeGreaterThanOrEqual(15 * 60 * 1000)
    expect(STALE_CLAIM_THRESHOLD_MS).toBeGreaterThan(settingsConfig.systemBounds.maxTimeoutSeconds * 1000)
  })

  it("heartbeat jauh lebih rapat dari ambang stale dan berumur lebih panjang dari ambang", () => {
    expect(CLAIM_HEARTBEAT_INTERVAL_MS * 5).toBeLessThanOrEqual(STALE_CLAIM_THRESHOLD_MS)
    expect(CLAIM_HEARTBEAT_MAX_LIFETIME_MS).toBeGreaterThan(STALE_CLAIM_THRESHOLD_MS)
  })
})

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
