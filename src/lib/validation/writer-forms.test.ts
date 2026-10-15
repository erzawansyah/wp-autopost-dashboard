import { describe, expect, it } from "vitest"
import {
  CreateBatchBodySchema,
  KeywordBatchFormSchema,
  localDateTimeToIso,
  parseKeywordLines,
  StructuredBatchFormSchema,
  toCreateBatchBody,
  type BatchSettingsFormInput,
} from "@/lib/validation/batches"
import { BulkDeletePostsBodySchema, QuickPostBodySchema, QuickPostFormSchema, toQuickPostBody } from "@/lib/validation/posts"

const SITE_ID = "44444444-4444-4444-8444-444444444444"

const settings: BatchSettingsFormInput = {
  siteId: SITE_ID,
  batchName: "  ",
  agentProfileRef: "preset:quick-writer",
  language: "id",
  categoryIds: [3],
  categoryNames: ["Kopi"],
  tags: "kopi, , susu ",
  customBrief: "",
  strategy: {
    executionMode: "scheduled_drip",
    mode: "interval",
    randomStartDate: "2026-10-15T09:00",
    randomEndDate: "2026-10-22T09:00",
    intervalStartDate: "2026-10-15T09:00",
    intervalHours: 6,
    intervalJitter: true,
    targetStatus: "publish",
  },
}

describe("form Tulis Cepat", () => {
  it("pesan error Indonesia untuk field wajib", () => {
    const result = QuickPostFormSchema.safeParse({
      siteId: "",
      keyword: "   ",
      agentProfileRef: "preset:quick-writer",
      language: "id",
      categoryIds: [],
      categoryNames: [],
      tags: "",
      customBrief: "",
      actionStatus: "draft",
    })
    expect(result.success).toBe(false)
    const messages = Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]))
    expect(messages).toMatchObject({ siteId: "Pilih website WordPress tujuan.", keyword: "Kata kunci wajib diisi." })
  })

  it("nilai form → body route yang lolos skema server", () => {
    const values = QuickPostFormSchema.parse({
      siteId: SITE_ID,
      keyword: "  kopi susu ",
      agentProfileRef: "preset:research-writer",
      language: "en",
      categoryIds: [7],
      categoryNames: ["Minuman"],
      tags: " a, b ",
      customBrief: "",
      actionStatus: "publish",
    })
    const body = toQuickPostBody(values)
    expect(body).toMatchObject({ keyword: "kopi susu", customBrief: undefined, tags: "a, b", category_ids: [7] })
    expect(QuickPostBodySchema.parse(body)).toMatchObject({ tags: ["a", "b"], actionStatus: "publish", agentProfileRef: "preset:research-writer" })
  })

  it("hapus massal dibatasi 100 ID", () => {
    expect(BulkDeletePostsBodySchema.safeParse({ ids: [] }).success).toBe(false)
    expect(BulkDeletePostsBodySchema.safeParse({ ids: Array.from({ length: 101 }, () => SITE_ID) }).success).toBe(false)
  })
})

describe("form Tulis Massal & Terstruktur", () => {
  it("parseKeywordLines: baris kosong diabaikan, duplikat dihitung", () => {
    expect(parseKeywordLines(" kopi \n\nteh\nkopi\r\n")).toEqual({ keywords: ["kopi", "teh"], duplicateCount: 1 })
  })

  it("daftar kata kunci kosong / lebih dari 50 ditolak dengan pesan yang sama seperti route", () => {
    const empty = KeywordBatchFormSchema.safeParse({ ...settings, keywordsText: "\n \n" })
    expect(empty.error?.issues[0]).toMatchObject({ path: ["keywordsText"], message: expect.stringContaining("tidak boleh kosong") })

    const many = Array.from({ length: 51 }, (_, index) => `kata ${index}`).join("\n")
    const tooMany = KeywordBatchFormSchema.safeParse({ ...settings, keywordsText: many })
    expect(tooMany.error?.issues[0].message).toContain("Saat ini ada 51 kata kunci")

    expect(StructuredBatchFormSchema.safeParse({ ...settings, rawText: "  " }).success).toBe(false)
  })

  it("toCreateBatchBody: jadwal datetime-local → ISO, tag dipisah, lolos skema route", () => {
    const values = KeywordBatchFormSchema.parse({ ...settings, keywordsText: "kopi\nteh" })
    const body = toCreateBatchBody(values, { keywords: parseKeywordLines(values.keywordsText).keywords })
    expect(body).toMatchObject({
      siteId: SITE_ID,
      batchName: undefined,
      keywords: ["kopi", "teh"],
      executionMode: "scheduled_drip",
      scheduleMode: "interval",
      randomConfig: undefined,
      intervalConfig: { startDate: new Date("2026-10-15T09:00").toISOString(), intervalHours: 6, enableJitter: true },
      tags: ["kopi", "susu"],
      customBrief: undefined,
    })
    expect(CreateBatchBodySchema.safeParse(body).success).toBe(true)
  })

  it("baris terstruktur melebihi batas kolom terdeteksi sebelum dikirim", () => {
    const values = StructuredBatchFormSchema.parse({ ...settings, rawText: "keyword\nkopi" })
    const body = toCreateBatchBody(values, { items: [{ keyword: "kopi", focus: "x".repeat(2_001) }] })
    const result = CreateBatchBodySchema.safeParse(body)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(["items", 0, "focus"])
  })

  it("localDateTimeToIso: kosong tetap kosong, tidak valid diteruskan", () => {
    expect(localDateTimeToIso("")).toBe("")
    expect(localDateTimeToIso("bukan-tanggal")).toBe("bukan-tanggal")
  })
})
