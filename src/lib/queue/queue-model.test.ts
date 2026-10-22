import { describe, expect, it } from "vitest"
import { pollDelay, PollBackoff, POLL_BASE_MS, POLL_MAX_MS } from "@/lib/queue/poll-backoff"
import { compareStates, countStatusGroups, hasInFlightItems, statusGroupOf } from "@/lib/queue/states"
import {
  extractCategoryNames,
  formatSiteDomain,
  matchesQueueSearch,
  scheduleKindOf,
  scheduleTimeOf,
  toQueueTableItem,
} from "@/lib/queue/table-model"
import type { PostListItem, QueueItem } from "@/types/queue"

const NOW = Date.parse("2026-10-15T10:00:00Z")

function queueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "item-1",
    batch_id: null,
    target_keyword: "kopi susu",
    title: null,
    state: "queued_input",
    wp_target_status: "publish",
    wp_post_id: null,
    wp_post_url: null,
    scheduled_for: null,
    next_attempt_at: null,
    retry_count: 0,
    last_error: null,
    created_at: "2026-10-15T09:00:00Z",
    updated_at: "2026-10-15T09:30:00Z",
    content_batches: null,
    wp_sites: { id: "site-1", site_name: "Blog Kopi", base_url: "https://kopi.example/" },
    ...overrides,
  }
}

describe("states", () => {
  it("mengelompokkan 9 state ke filter status", () => {
    expect(statusGroupOf("generating_content")).toBe("processing")
    expect(statusGroupOf("ready_to_sync")).toBe("processing")
    expect(statusGroupOf("published_on_wp")).toBe("published")
    expect(statusGroupOf("scheduled_on_wp")).toBe("scheduled")
    expect(statusGroupOf("saved_draft_on_wp")).toBe("draft")
    expect(statusGroupOf("failed_sync")).toBe("failed")
    expect(statusGroupOf("failed_generation")).toBe("failed")
  })

  it("menghitung jumlah per kelompok + total", () => {
    expect(countStatusGroups(["queued_input", "failed_sync", "failed_generation", "published_on_wp"])).toEqual({
      all: 4,
      processing: 1,
      published: 1,
      draft: 0,
      scheduled: 0,
      failed: 2,
    })
  })

  it("item in-flight terdeteksi; daftar kosong/undefined tidak", () => {
    expect(hasInFlightItems([{ state: "published_on_wp" }, { state: "syncing_to_wp" }])).toBe(true)
    expect(hasInFlightItems([{ state: "published_on_wp" }])).toBe(false)
    expect(hasInFlightItems(undefined)).toBe(false)
  })

  it("urutan sorting status menaruh kegagalan paling atas", () => {
    const sorted = (["published_on_wp", "failed_sync", "queued_input"] as const).toSorted(compareStates)
    expect(sorted).toEqual(["failed_sync", "queued_input", "published_on_wp"])
  })
})

describe("PollBackoff", () => {
  it("jeda berlipat dua tiap polling tanpa perubahan, dibatasi maksimum", () => {
    expect(pollDelay(0)).toBe(POLL_BASE_MS)
    expect(pollDelay(1)).toBe(POLL_BASE_MS * 2)
    expect(pollDelay(10)).toBe(POLL_MAX_MS)
  })

  it("berhenti bila tidak ada item aktif; reset ke jeda awal saat data berubah", () => {
    const backoff = new PollBackoff()
    const dataA = [{ state: "queued_input" }]
    expect(backoff.next({ pollCount: 1, data: dataA, active: true })).toBe(POLL_BASE_MS)
    // Evaluasi ulang tanpa fetch baru tidak menaikkan backoff.
    expect(backoff.next({ pollCount: 1, data: dataA, active: true })).toBe(POLL_BASE_MS)
    expect(backoff.next({ pollCount: 2, data: dataA, active: true })).toBe(POLL_BASE_MS * 2)
    expect(backoff.next({ pollCount: 3, data: dataA, active: true })).toBe(POLL_BASE_MS * 4)

    const dataB = [{ state: "generating_content" }]
    expect(backoff.next({ pollCount: 4, data: dataB, active: true })).toBe(POLL_BASE_MS)
    expect(backoff.next({ pollCount: 5, data: dataB, active: false })).toBe(false)
    expect(backoff.next({ pollCount: 6, data: dataB, active: true })).toBe(POLL_BASE_MS)
  })
})

describe("table-model", () => {
  it("item tanpa batch → grup virtual Tulis Cepat; domain dirapikan", () => {
    const row = toQueueTableItem(queueItem({ title: "Kopi Susu Kekinian" }))
    expect(row).toMatchObject({
      title: "Kopi Susu Kekinian",
      batchId: "quick-writer",
      batchName: "Tulis Cepat (Quick Writer)",
      siteDomain: "kopi.example",
      status: "queued_input",
      categories: [],
    })
  })

  it("judul kosong memakai kata kunci; nama batch dari relasi", () => {
    const row = toQueueTableItem(
      queueItem({ batch_id: "b1", content_batches: { id: "b1", name: "Batch Kopi", execution_mode: "immediate" } })
    )
    expect(row.title).toBe("kopi susu")
    expect(row.batchName).toBe("Batch Kopi")
  })

  it("item Tulis Niche sebelum rencana kata kunci (kata kunci kosong) → judul & topik penanda AI", () => {
    const row = toQueueTableItem(queueItem({ target_keyword: "" }))
    expect(row.title).toBe("Menunggu kata kunci dari AI")
    expect(row.targetKeyword).toBe("disusun AI")
    expect(toQueueTableItem(queueItem({ target_keyword: "kopi susu" })).targetKeyword).toBe("kopi susu")
  })

  it("kategori: ID numerik lama diabaikan, cadangan dari source_payload", () => {
    expect(extractCategoryNames(["12", "Resep"], null)).toEqual(["Resep"])
    expect(extractCategoryNames([3, 4], { category_names: ["Minuman", " "] })).toEqual(["Minuman"])
    expect(extractCategoryNames(null, { categoryList: ["Kuliner"] })).toEqual(["Kuliner"])
    const post: PostListItem = {
      ...queueItem(),
      excerpt: null,
      categories: ["Kopi"],
      tags: null,
      source_payload: { aiModel: "acme/model" },
    }
    expect(toQueueTableItem(post)).toMatchObject({ categories: ["Kopi"], aiModel: "acme/model" })
  })

  it("pencarian lintas judul, situs, batch, kategori", () => {
    const row = toQueueTableItem(queueItem({ title: "Panduan Kopi" }))
    expect(matchesQueueSearch(row, "panduan")).toBe(true)
    expect(matchesQueueSearch(row, "KOPI.EXAMPLE")).toBe(true)
    expect(matchesQueueSearch(row, "tulis cepat")).toBe(true)
    expect(matchesQueueSearch(row, "teh")).toBe(false)
    expect(matchesQueueSearch(row, "  ")).toBe(true)
  })

  it("kolom jadwal: rencana tayang hanya untuk item in-flight berjadwal di masa depan", () => {
    const planned = toQueueTableItem(queueItem({ scheduled_for: "2026-10-16T10:00:00Z" }))
    expect(scheduleKindOf(planned, NOW)).toBe("planned")
    expect(scheduleTimeOf(planned, "planned")).toBe("2026-10-16T10:00:00Z")

    const queued = toQueueTableItem(queueItem({ scheduled_for: "2026-10-14T10:00:00Z" }))
    expect(scheduleKindOf(queued, NOW)).toBe("queued")
    expect(scheduleTimeOf(queued, "queued")).toBe("2026-10-15T09:00:00Z")

    const scheduled = toQueueTableItem(queueItem({ state: "scheduled_on_wp", scheduled_for: "2026-10-20T08:00:00Z" }))
    expect(scheduleKindOf(scheduled, NOW)).toBe("scheduled_on_wp")
    expect(scheduleKindOf(toQueueTableItem(queueItem({ state: "failed_sync" })), NOW)).toBe("failed")
  })

  it("formatSiteDomain menangani nilai kosong", () => {
    expect(formatSiteDomain(undefined)).toBe("-")
    expect(formatSiteDomain("http://a.b/")).toBe("a.b")
  })
})
