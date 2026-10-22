import { beforeEach, describe, expect, it, vi } from "vitest"
import { LlmCallError } from "@/core/shared/llm/errors"
import { LlmUsageLedger } from "@/core/shared/llm/usage"
import type { QueueDbClient } from "@/core/queue/batch-progress"
import {
  NicheKeywordError,
  isPendingNicheKeyword,
  normalizeKeywordKey,
  resolveNicheKeyword,
  selectNicheKeywords,
  type NicheKeywordRequest,
} from "@/core/queue/niche-keywords"

/**
 * Rencana kata kunci Tulis Niche: penyaringan keluaran LLM (murni), pemakaian rencana tersimpan tanpa LLM,
 * penyusunan rencana (data situs + autocomplete di blok data, putaran kedua untuk kekurangan), penyimpanan lewat
 * RPC berpagar klaim, dan klasifikasi kegagalan untuk retry antrean. Gateway LLM, WordPress, dan autocomplete
 * di-mock; Supabase memakai fake query builder.
 */

const mocks = vi.hoisted(() => ({
  createLlmGateway: vi.fn(),
  completeJson: vi.fn(),
  flush: vi.fn(),
  fetchWordPressPostTitles: vi.fn(),
  getKeywordSuggestions: vi.fn(),
}))

vi.mock("@/core/shared/llm/gateway", () => ({ createLlmGateway: mocks.createLlmGateway }))
vi.mock("@/lib/wordpress/client", () => ({ fetchWordPressPostTitles: mocks.fetchWordPressPostTitles }))
vi.mock("@/core/shared/tools/keyword-suggestions", () => ({ getKeywordSuggestions: mocks.getKeywordSuggestions }))

interface Op {
  table: string
  filters: Array<[string, string, unknown]>
  payload?: Record<string, unknown>
}

interface FakeDb {
  ops: Op[]
  batch: Record<string, unknown> | null
  batchError?: { message: string }
  queued: Array<{ target_keyword: string; title: string | null }>
  rpcResult: { data: unknown; error: { message: string } | null } | ((args: Record<string, unknown>) => unknown)
}

function fakeSupabase(db: FakeDb): QueueDbClient {
  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      db.ops.push({ table: `rpc:${fn}`, filters: [], payload: args })
      return typeof db.rpcResult === "function" ? { data: db.rpcResult(args), error: null } : db.rpcResult
    },
    from(table: string) {
      const op: Op = { table, filters: [] }
      db.ops.push(op)
      const result = () =>
        table === "content_batches"
          ? { data: db.batch, error: db.batchError ?? null }
          : { data: db.queued, error: null }
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => (op.filters.push(["eq", column, value]), builder),
        neq: (column: string, value: unknown) => (op.filters.push(["neq", column, value]), builder),
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => result(),
        then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(result()).then(onFulfilled, onRejected),
      }
      return builder
    },
  }
  return client as unknown as QueueDbClient
}

const TOKEN = "runner-uji:abc"

function request(overrides: Partial<NicheKeywordRequest> = {}): NicheKeywordRequest {
  return {
    claim: { id: "post-2", userId: "user-1", batchId: "batch-1", leaseToken: TOKEN },
    slotIndex: 1,
    site: { id: "site-1", siteName: "Kopi Nusantara", baseUrl: "https://kopi.test", username: "editor", applicationPassword: "pw" },
    language: "id",
    model: "google/gemini-2.5-flash",
    userKeys: { openrouterKey: "sk-or-test", searxngUrl: "https://searx.test", searchPreferences: { default_provider: "auto" } },
    usage: new LlmUsageLedger(),
    signal: new AbortController().signal,
    ...overrides,
  }
}

function nicheDb(overrides: Partial<FakeDb> = {}): FakeDb {
  return {
    ops: [],
    batch: {
      total_items: 3,
      custom_instructions_override: "Gaya santai.",
      ai_config: { niche: "kopi manual brew", niche_article_count: 3 },
    },
    queued: [{ target_keyword: "cara grind kopi", title: "Panduan Grind Kopi di Rumah" }],
    rpcResult: (args) => args.p_keywords,
    ...overrides,
  }
}

beforeEach(() => {
  mocks.completeJson.mockReset()
  mocks.flush.mockReset().mockResolvedValue(undefined)
  mocks.createLlmGateway.mockReset().mockImplementation((options: { apiKey?: string }) => ({
    hasKey: Boolean(options.apiKey),
    completeJson: mocks.completeJson,
    flush: mocks.flush,
  }))
  mocks.fetchWordPressPostTitles.mockReset().mockResolvedValue({ ok: true, titles: ["Cara Seduh V60 &#8211; Pemula"] })
  mocks.getKeywordSuggestions
    .mockReset()
    .mockResolvedValue({ ok: true, data: { query: "kopi manual brew", suggestions: ["kopi manual brew rasio"], sources: ["google"], total: 1 } })
})

describe("penyaring kata kunci (murni)", () => {
  it("isPendingNicheKeyword: hanya item Tulis Niche berkata kunci kosong", () => {
    expect(isPendingNicheKeyword("", { keyword_source: "niche_auto" })).toBe(true)
    expect(isPendingNicheKeyword("  ", { keyword_source: "niche_auto" })).toBe(true)
    expect(isPendingNicheKeyword("kopi", { keyword_source: "niche_auto" })).toBe(false)
    expect(isPendingNicheKeyword("", {})).toBe(false)
  })

  it("normalizeKeywordKey: huruf kecil, tanda baca & spasi dirapikan", () => {
    expect(normalizeKeywordKey("  Cara Seduh: V60 — Pemula!  ")).toBe("cara seduh v60 pemula")
  })

  it("selectNicheKeywords: teks polos, penomoran/kutip dibuang, unik, tanpa topik yang sudah ada, dibatasi", () => {
    const covered = new Set([normalizeKeywordKey("Cara Seduh V60")])
    const picked = selectNicheKeywords(
      [
        "1. Rasio kopi dan air untuk french press.",
        '"rasio kopi dan air untuk French Press"',
        "<b>cara seduh v60</b>",
        " ?? ",
        "ab",
        42,
        "- tips menyimpan biji kopi",
        "alat manual brew untuk pemula",
      ],
      covered,
      2
    )
    expect(picked).toEqual(["Rasio kopi dan air untuk french press", "tips menyimpan biji kopi"])
    expect(selectNicheKeywords("bukan array", covered, 5)).toEqual([])
  })
})

describe("resolveNicheKeyword — rencana tersimpan", () => {
  it("memakai ai_config.niche_keywords[slot] tanpa LLM maupun RPC", async () => {
    const db = nicheDb({ batch: { total_items: 3, custom_instructions_override: null, ai_config: { niche: "kopi", niche_keywords: ["a", "b", "c"] } } })

    const result = await resolveNicheKeyword(fakeSupabase(db), request())

    expect(result).toEqual({ status: "ready", keyword: "b", slot: 1, total: 3, plan: null })
    expect(mocks.createLlmGateway).not.toHaveBeenCalled()
    expect(db.ops.map((op) => op.table)).toEqual(["content_batches"])
    expect(db.ops[0].filters).toEqual([
      ["eq", "id", "batch-1"],
      ["eq", "user_id", "user-1"],
      ["eq", "source_type", "niche_auto"],
    ])
  })

  it("rencana tidak memuat slot → kegagalan permanen", async () => {
    const db = nicheDb({ batch: { total_items: 3, custom_instructions_override: null, ai_config: { niche: "kopi", niche_keywords: ["a"] } } })
    await expect(resolveNicheKeyword(fakeSupabase(db), request())).rejects.toMatchObject({ failure: "permanent" })
  })
})

describe("resolveNicheKeyword — menyusun rencana", () => {
  it("data situs, antrean & autocomplete masuk blok data; rencana disimpan lewat RPC berpagar", async () => {
    mocks.completeJson.mockResolvedValueOnce({
      keywords: ["Panduan Grind Kopi di Rumah", "rasio kopi french press", "cara menyimpan biji kopi", "alat manual brew pemula"],
      rationale: "Sebaran alat, teknik, dan penyimpanan.",
    })
    const db = nicheDb()
    const usage = new LlmUsageLedger()

    const result = await resolveNicheKeyword(fakeSupabase(db), request({ usage }))

    expect(result).toEqual({
      status: "ready",
      keyword: "cara menyimpan biji kopi",
      slot: 1,
      total: 3,
      plan: {
        niche: "kopi manual brew",
        keywords: ["rasio kopi french press", "cara menyimpan biji kopi", "alat manual brew pemula"],
        rationale: "Sebaran alat, teknik, dan penyimpanan.",
        adoptedExisting: false,
        sources: { existingTitles: 1, plannedKeywords: 2, searchSuggestions: 1 },
        llmCalls: 1,
      },
    })

    const gatewayOptions = mocks.createLlmGateway.mock.calls[0][0]
    expect(gatewayOptions).toMatchObject({ apiKey: "sk-or-test", modelCandidates: ["google/gemini-2.5-flash"], usage })
    const call = mocks.completeJson.mock.calls[0][0]
    expect(call.userPrompt).toContain('NICHE: "kopi manual brew"')
    expect(call.userPrompt).toContain("NUMBER OF KEYWORDS: 8")
    expect(call.userPrompt).toContain("Gaya santai.")
    expect(call.userPrompt).toMatch(/<data_site>[\s\S]*Cara Seduh V60 – Pemula[\s\S]*cara grind kopi[\s\S]*kopi manual brew rasio[\s\S]*<\/data_site>/)
    expect(call.jsonSchema).toMatchObject({ required: ["keywords"] })
    expect(mocks.flush).toHaveBeenCalledTimes(1)

    const rpc = db.ops.find((op) => op.table === "rpc:assign_niche_keywords")
    expect(rpc?.payload).toEqual({
      p_post_item_id: "post-2",
      p_lease_token: TOKEN,
      p_keywords: ["rasio kopi french press", "cara menyimpan biji kopi", "alat manual brew pemula"],
    })
    const queueQuery = db.ops.find((op) => op.table === "post_items")
    expect(queueQuery?.filters).toEqual([
      ["eq", "user_id", "user-1"],
      ["eq", "wp_site_id", "site-1"],
      ["neq", "target_keyword", ""],
    ])
  })

  it("kekurangan setelah penyaringan → putaran kedua meminta sisanya dengan pilihan putaran pertama dikecualikan", async () => {
    mocks.completeJson
      .mockResolvedValueOnce({ keywords: ["rasio kopi french press", "rasio kopi french press!"] })
      .mockResolvedValueOnce({ keywords: ["rasio kopi french press", "cara menyimpan biji kopi", "alat manual brew pemula"] })

    const result = await resolveNicheKeyword(fakeSupabase(nicheDb()), request({ slotIndex: 2 }))

    expect(result).toMatchObject({ status: "ready", keyword: "alat manual brew pemula", plan: { llmCalls: 2 } })
    const second = mocks.completeJson.mock.calls[1][0]
    expect(second.userPrompt).toContain("NUMBER OF KEYWORDS: 7")
    expect(second.userPrompt).toMatch(/"plannedKeywords": \[[\s\S]*"rasio kopi french press"[\s\S]*\]/)
  })

  it("tetap kurang setelah dua putaran → kegagalan sementara (retry antrean), rencana tidak disimpan", async () => {
    mocks.completeJson.mockResolvedValue({ keywords: ["rasio kopi french press"] })
    const db = nicheDb()

    const error = await resolveNicheKeyword(fakeSupabase(db), request()).catch((err: unknown) => err)

    expect(error).toBeInstanceOf(NicheKeywordError)
    expect(error).toMatchObject({ failure: "transient", message: expect.stringContaining("1 dari 3") })
    expect(db.ops.some((op) => op.table === "rpc:assign_niche_keywords")).toBe(false)
  })

  it("klaim lain menyimpan rencana lebih dulu → rencana tersimpan dipakai (adoptedExisting)", async () => {
    mocks.completeJson.mockResolvedValueOnce({ keywords: ["x satu", "x dua", "x tiga"] })
    const db = nicheDb({ rpcResult: { data: ["y satu", "y dua", "y tiga"], error: null } })

    const result = await resolveNicheKeyword(fakeSupabase(db), request())

    expect(result).toMatchObject({ status: "ready", keyword: "y dua", plan: { adoptedExisting: true, keywords: ["y satu", "y dua", "y tiga"] } })
  })

  it("RPC mengembalikan NULL (klaim hilang) → claim_lost", async () => {
    mocks.completeJson.mockResolvedValueOnce({ keywords: ["x satu", "x dua", "x tiga"] })
    const db = nicheDb({ rpcResult: { data: null, error: null } })
    expect(await resolveNicheKeyword(fakeSupabase(db), request())).toEqual({ status: "claim_lost" })
  })

  it("sumber data situs yang gagal dilewati (best-effort)", async () => {
    mocks.fetchWordPressPostTitles.mockRejectedValueOnce(new Error("timeout"))
    mocks.getKeywordSuggestions.mockResolvedValueOnce({ ok: false, code: "upstream_error", message: "x", retryable: true })
    mocks.completeJson.mockResolvedValueOnce({ keywords: ["x satu", "x dua", "x tiga"] })

    const result = await resolveNicheKeyword(fakeSupabase(nicheDb()), request())

    expect(result).toMatchObject({ plan: { sources: { existingTitles: 0, plannedKeywords: 2, searchSuggestions: 0 } } })
  })
})

describe("resolveNicheKeyword — kegagalan", () => {
  it.each([
    ["kunci ditolak (401)", new LlmCallError("401", { kind: "auth", status: 401 }), "permanent"],
    ["kredit habis", new LlmCallError("402", { kind: "quota", status: 402 }), "permanent"],
    ["server LLM (503)", new LlmCallError("503", { kind: "server", status: 503 }), "transient"],
    ["JSON tidak valid", new LlmCallError("json", { kind: "invalid_output" }), "transient"],
  ])("galat LLM %s → %s", async (_label, error, failure) => {
    mocks.completeJson.mockRejectedValueOnce(error)
    await expect(resolveNicheKeyword(fakeSupabase(nicheDb()), request())).rejects.toMatchObject({ failure })
    expect(mocks.flush).toHaveBeenCalledTimes(1)
  })

  it("tanpa kunci OpenRouter → permanen tanpa memanggil LLM", async () => {
    const userKeys = { searchPreferences: { default_provider: "auto" as const } }
    await expect(resolveNicheKeyword(fakeSupabase(nicheDb()), request({ userKeys }))).rejects.toMatchObject({
      failure: "permanent",
      message: expect.stringContaining("OpenRouter"),
    })
    expect(mocks.completeJson).not.toHaveBeenCalled()
  })

  it("klaim dibatalkan saat LLM berjalan → error pembatalan diteruskan apa adanya", async () => {
    const controller = new AbortController()
    const abortError = new DOMException("dibatalkan", "AbortError")
    mocks.completeJson.mockImplementationOnce(async () => {
      controller.abort()
      throw abortError
    })
    await expect(resolveNicheKeyword(fakeSupabase(nicheDb()), request({ signal: controller.signal }))).rejects.toBe(abortError)
  })

  it.each([
    ["tanpa batch", { claim: { id: "p", userId: "user-1", batchId: null, leaseToken: TOKEN } }],
    ["slot tidak valid", { slotIndex: "1" }],
  ])("%s → permanen", async (_label, overrides) => {
    await expect(resolveNicheKeyword(fakeSupabase(nicheDb()), request(overrides))).rejects.toMatchObject({ failure: "permanent" })
  })

  it("batch tidak ditemukan → permanen; gagal membaca → sementara; niche kosong → permanen", async () => {
    await expect(resolveNicheKeyword(fakeSupabase(nicheDb({ batch: null })), request())).rejects.toMatchObject({ failure: "permanent" })
    await expect(
      resolveNicheKeyword(fakeSupabase(nicheDb({ batch: null, batchError: { message: "db down" } })), request())
    ).rejects.toMatchObject({ failure: "transient" })
    await expect(
      resolveNicheKeyword(
        fakeSupabase(nicheDb({ batch: { total_items: 3, custom_instructions_override: null, ai_config: { niche: "<b></b>" } } })),
        request()
      )
    ).rejects.toMatchObject({ failure: "permanent" })
  })
})
