import { describe, expect, it } from "vitest"
import { FINAL_SUCCESS_STATES, finalStateForStatus, inferRecordedFinalState } from "@/core/queue/final-state"

const NOW = new Date("2026-10-15T10:00:00Z")

describe("finalStateForStatus", () => {
  it("memetakan status post WordPress ke state akhir sukses", () => {
    expect(finalStateForStatus("draft")).toBe("saved_draft_on_wp")
    expect(finalStateForStatus("future")).toBe("scheduled_on_wp")
    expect(finalStateForStatus("publish")).toBe("published_on_wp")
    expect(FINAL_SUCCESS_STATES).toEqual(["published_on_wp", "scheduled_on_wp", "saved_draft_on_wp"])
  })
})

describe("inferRecordedFinalState", () => {
  it("draft tetap draft walau berjadwal", () => {
    expect(inferRecordedFinalState({ wpTargetStatus: "draft", scheduledFor: "2026-12-01T00:00:00Z" }, NOW)).toBe(
      "saved_draft_on_wp"
    )
  })

  it("jadwal di masa depan → terjadwal; lewat atau kosong → terbit", () => {
    expect(inferRecordedFinalState({ wpTargetStatus: "publish", scheduledFor: "2026-10-15T11:00:00Z" }, NOW)).toBe(
      "scheduled_on_wp"
    )
    expect(inferRecordedFinalState({ wpTargetStatus: "future", scheduledFor: "2026-10-15T09:00:00Z" }, NOW)).toBe(
      "published_on_wp"
    )
    expect(inferRecordedFinalState({ wpTargetStatus: null, scheduledFor: null }, NOW)).toBe("published_on_wp")
    expect(inferRecordedFinalState({ wpTargetStatus: "publish", scheduledFor: "bukan tanggal" }, NOW)).toBe(
      "published_on_wp"
    )
  })
})
