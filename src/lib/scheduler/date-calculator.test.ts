import { afterEach, describe, expect, it, vi } from "vitest"
import {
  calculateScheduleDates,
  INTERVAL_JITTER_MAX_MINUTES,
  INTERVAL_JITTER_MIN_MINUTES,
  intervalJitterMinutes,
} from "./date-calculator"

const MINUTE_MS = 60 * 1000
const START = "2026-11-01T09:00:00Z"

/** Sumber acak deterministik yang mengulang `values` secara berurutan. */
function sequence(...values: number[]): () => number {
  let index = 0
  return () => values[index++ % values.length]
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("intervalJitterMinutes", () => {
  it("besaran selalu 5–10 menit dengan arah maju atau mundur, tidak pernah 0", () => {
    expect(intervalJitterMinutes(sequence(0, 0))).toBe(-INTERVAL_JITTER_MIN_MINUTES)
    expect(intervalJitterMinutes(sequence(0, 0.5))).toBe(INTERVAL_JITTER_MIN_MINUTES)
    expect(intervalJitterMinutes(sequence(0.999999, 0.999999))).toBe(INTERVAL_JITTER_MAX_MINUTES)
    expect(intervalJitterMinutes(sequence(0.999999, 0.1))).toBe(-INTERVAL_JITTER_MAX_MINUTES)
    // Sumber acak yang (di luar kontrak Math.random) mengembalikan 1 tetap dibatasi ke maksimum.
    expect(intervalJitterMinutes(sequence(1, 1))).toBe(INTERVAL_JITTER_MAX_MINUTES)
  })

  it("acak sungguhan: setiap nilai bulat di ±[5, 10]", () => {
    for (let i = 0; i < 500; i++) {
      const minutes = intervalJitterMinutes()
      expect(Number.isInteger(minutes)).toBe(true)
      expect(Math.abs(minutes)).toBeGreaterThanOrEqual(INTERVAL_JITTER_MIN_MINUTES)
      expect(Math.abs(minutes)).toBeLessThanOrEqual(INTERVAL_JITTER_MAX_MINUTES)
    }
  })
})

describe("calculateScheduleDates — pola interval", () => {
  it("variasi aktif: artikel pertama tepat di waktu mulai, berikutnya bergeser 5–10 menit dari jadwal dasar", () => {
    const slots = calculateScheduleDates({
      mode: "interval",
      itemCount: 40,
      intervalConfig: { startDate: START, intervalHours: 6, enableJitter: true },
    })

    expect(slots).toHaveLength(40)
    expect(slots[0].scheduledFor.toISOString()).toBe("2026-11-01T09:00:00.000Z")
    for (const slot of slots.slice(1)) {
      const base = Date.parse(START) + slot.index * 6 * 60 * MINUTE_MS
      const offsetMinutes = Math.abs(slot.scheduledFor.getTime() - base) / MINUTE_MS
      expect(offsetMinutes).toBeGreaterThanOrEqual(INTERVAL_JITTER_MIN_MINUTES)
      expect(offsetMinutes).toBeLessThanOrEqual(INTERVAL_JITTER_MAX_MINUTES)
      // Regresi: dulu −10…+10 (bisa 0) sehingga bisa jatuh tepat di menit :00.
      expect(slot.scheduledFor.getUTCMinutes()).not.toBe(0)
    }
  })

  it("Math.random 0,5 (rumus lama → offset 0, tepat :00) kini menggeser 8 menit", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5)
    const slots = calculateScheduleDates({
      mode: "interval",
      itemCount: 2,
      intervalConfig: { startDate: START, intervalHours: 24, enableJitter: true },
    })
    // random 0.5 → besaran 5 + floor(0.5 × 6) = 8 menit, arah maju (0.5 bukan < 0.5).
    expect(slots[1].scheduledFor.toISOString()).toBe("2026-11-02T09:08:00.000Z")
  })

  it("variasi dimatikan: tepat setiap `intervalHours` jam", () => {
    const slots = calculateScheduleDates({
      mode: "interval",
      itemCount: 3,
      intervalConfig: { startDate: START, intervalHours: 12, enableJitter: false },
    })
    expect(slots.map((slot) => slot.scheduledFor.toISOString())).toEqual([
      "2026-11-01T09:00:00.000Z",
      "2026-11-01T21:00:00.000Z",
      "2026-11-02T09:00:00.000Z",
    ])
  })
})
