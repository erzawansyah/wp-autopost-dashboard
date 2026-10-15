import { describe, expect, it } from "vitest"
import { describeExecutionLog, formatLogTime } from "@/lib/queue/execution-log"
import { getQueueRetryAction, RETRY_ACTION_COPY } from "@/lib/queue/retry-actions"
import { checkpointStepLabel, formatDuration, formatUsd, stopReasonLabel } from "@/lib/queue/run-metrics"
import { defaultScheduleWindow, toAgentProfileOptions, toLocalDateTimeInput } from "@/lib/queue/writer-options"

describe("run-metrics", () => {
  it("biaya null/tidak valid → 'tidak dilaporkan'; numeric string dari PostgREST diformat", () => {
    expect(formatUsd(null)).toBe("tidak dilaporkan")
    expect(formatUsd("abc")).toBe("tidak dilaporkan")
    expect(formatUsd("0.091000")).toContain("0,091")
    expect(formatUsd(0)).toContain("0,00")
  })

  it("durasi & label checkpoint/alasan berhenti", () => {
    expect(formatDuration(850)).toBe("850 ms")
    expect(formatDuration(12_400)).toBe("12,4 dtk")
    expect(formatDuration(185_000)).toBe("3 mnt 05 dtk")
    expect(formatDuration(null)).toBe("—")
    expect(checkpointStepLabel("draft")).toBe("Draf naskah")
    expect(checkpointStepLabel("lain")).toBe("lain")
    expect(stopReasonLabel("llm_quota_exhausted")).toBe("Kuota/kredit OpenRouter habis")
    expect(stopReasonLabel(null)).toBeNull()
  })
})

describe("retry-actions copy", () => {
  it("salinan 'Tulis ulang' menjelaskan pemakaian ulang draf tersimpan (cost-saver)", () => {
    expect(getQueueRetryAction("failed_generation")).toBe("regenerate")
    expect(RETRY_ACTION_COPY.regenerate.hint).toMatch(/draf tersimpan/i)
    expect(RETRY_ACTION_COPY.resync.hint).toMatch(/tanpa menulis ulang/i)
  })
})

describe("execution-log", () => {
  it("tool call: judul ramah, payload input & ringkasan output", () => {
    const view = describeExecutionLog({
      id: "1",
      step: "tool_call",
      level: "info",
      message: "[web_search] 5 hasil",
      details: { tool: "web_search", input: { query: "kopi" }, durationMs: 120 },
      created_at: "2026-10-15T03:04:05Z",
    })
    expect(view).toMatchObject({
      title: "Eksekusi Tool: Web Search (Penelusuran Internet)",
      description: "5 hasil",
      code: "web_search",
      isError: false,
      durationMs: 120,
      input: { query: "kopi" },
      output: { tool: "web_search", status: "ok", ringkasan: "5 hasil", durasi_eksekusi: "120 ms" },
    })
  })

  it("node dikenal & error level ditandai; jam memakai WIB", () => {
    const view = describeExecutionLog({
      id: "2",
      step: "wordpress_publisher",
      level: "error",
      message: "HTTP 500",
      details: null,
      created_at: "2026-10-15T03:04:05Z",
    })
    expect(view.title).toBe("Pengiriman ke WordPress REST API")
    expect(view.isError).toBe(true)
    expect(view.output).toBeUndefined()
    expect(formatLogTime("2026-10-15T03:04:05Z")).toBe("10.04.05")
  })
})

describe("writer-options", () => {
  it("opsi Agent Profile ringkas: preset dulu, mode tak dikenal → standard", () => {
    expect(
      toAgentProfileOptions({
        presets: [{ ref: "preset:quick-writer", name: "Quick", mode: "standard", toolIds: ["a", "b"] }],
        userProfiles: [{ ref: "uuid-1", name: "Saya", description: "Kustom", mode: "deep" }],
      })
    ).toEqual([
      { ref: "preset:quick-writer", name: "Quick", description: "", mode: "standard", toolCount: 2, isPreset: true },
      { ref: "uuid-1", name: "Saya", description: "Kustom", mode: "deep", toolCount: 0, isPreset: false },
    ])
  })

  it("nilai datetime-local & jendela default 7 hari", () => {
    const now = new Date(2026, 9, 15, 9, 30)
    expect(toLocalDateTimeInput(now)).toBe("2026-10-15T09:30")
    expect(defaultScheduleWindow(now)).toEqual({ start: "2026-10-15T09:30", end: "2026-10-22T09:30" })
  })
})
