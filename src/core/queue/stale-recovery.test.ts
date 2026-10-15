import { describe, expect, it } from "vitest"
import settingsConfig from "@/core/shared/settings.json"
import { MAX_AUTO_ATTEMPTS } from "@/core/queue/retry-policy"
import {
  CLAIM_HEARTBEAT_INTERVAL_MS,
  CLAIM_HEARTBEAT_MAX_LIFETIME_MS,
  STALE_CLAIM_THRESHOLD_MS,
  decideStaleRecovery,
  isStaleRecoverableState,
} from "@/core/queue/stale-recovery"

describe("ambang stale (baris lama tanpa lease) & heartbeat", () => {
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
      expect(decision.nextAttemptAt).toBeNull()
      expect(decision.lastError).toMatch(/tidak akan digenerasi ulang/)
    }
  })

  it("generating_content diantrekan ulang dengan retry_count bertambah & backoff selama di bawah batas", () => {
    const now = new Date("2026-10-15T10:00:00Z")
    const first = decideStaleRecovery({ state: "generating_content", retryCount: null }, { now })
    expect(first).toMatchObject({ state: "queued_input", retryCount: 1 })
    expect(first.nextAttemptAt?.toISOString()).toBe("2026-10-15T10:01:00.000Z")

    const second = decideStaleRecovery({ state: "generating_content", retryCount: 1 })
    expect(second).toMatchObject({ state: "queued_input", retryCount: 2 })
    expect(second.lastError).toContain(`percobaan 2 dari ${MAX_AUTO_ATTEMPTS}`)
  })

  it("generating_content berhenti di failed_generation setelah batas percobaan", () => {
    const decision = decideStaleRecovery({
      state: "generating_content",
      retryCount: MAX_AUTO_ATTEMPTS - 1,
    })
    expect(decision.state).toBe("failed_generation")
    expect(decision.retryCount).toBe(MAX_AUTO_ATTEMPTS)
    expect(decision.nextAttemptAt).toBeNull()
    expect(decision.lastError).toMatch(/dihentikan otomatis/)

    expect(decideStaleRecovery({ state: "generating_content", retryCount: 10 }).state).toBe("failed_generation")
  })

  it("menghormati batas kustom dan menormalkan retry_count negatif", () => {
    expect(decideStaleRecovery({ state: "generating_content", retryCount: 0 }, { maxGenerationAttempts: 1 }).state).toBe(
      "failed_generation"
    )
    expect(decideStaleRecovery({ state: "generating_content", retryCount: -4 })).toMatchObject({
      state: "queued_input",
      retryCount: 1,
    })
  })
})

describe("decideStaleRecovery — wp_post_id tercatat & retry_count ekstrem", () => {
  const NOW = new Date("2026-10-15T10:00:00Z")

  it("syncing_to_wp dengan wp_post_id dituntaskan sukses sesuai status target/jadwal, bukan failed_sync", () => {
    const base = { state: "syncing_to_wp" as const, retryCount: 1, wpPostId: 77 }
    expect(decideStaleRecovery({ ...base, wpTargetStatus: "draft" }, { now: NOW })).toMatchObject({
      state: "saved_draft_on_wp",
      retryCount: 1,
      lastError: null,
      nextAttemptAt: null,
    })
    expect(
      decideStaleRecovery({ ...base, wpTargetStatus: "publish", scheduledFor: "2026-10-16T09:00:00Z" }, { now: NOW }).state
    ).toBe("scheduled_on_wp")
    const published = decideStaleRecovery({ ...base, wpTargetStatus: "future", scheduledFor: "2026-10-14T09:00:00Z" }, { now: NOW })
    expect(published.state).toBe("published_on_wp")
    expect(published.summary).toMatch(/WP ID #77/)
  })

  it("generating_content dengan wp_post_id tetap mengikuti aturan generasi (tidak dianggap terbit)", () => {
    expect(decideStaleRecovery({ state: "generating_content", retryCount: 0, wpPostId: 77 }).state).toBe("queued_input")
  })

  it("retry_count di luar batas tidak pernah meluap (integer out of range) maupun melanggar CHECK", () => {
    const decision = decideStaleRecovery({ state: "generating_content", retryCount: 2147483647 })
    expect(decision).toMatchObject({ state: "failed_generation", retryCount: 1000 })
    expect(decideStaleRecovery({ state: "syncing_to_wp", retryCount: 5000 }).retryCount).toBe(1000)
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
