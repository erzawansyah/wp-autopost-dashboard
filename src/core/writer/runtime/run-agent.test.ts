import { beforeEach, describe, expect, it, vi } from "vitest"
import { tool } from "@langchain/core/tools"
import { OpenRouterError } from "@langchain/openrouter"
import { z } from "zod"
import type { DecryptedUserKeys } from "@/types/settings"
import { WriterRequestSchema } from "../types/contracts"
import { DEFAULT_STANDARD_LIMITS, type AgentProfile } from "../types/profile"
import { ToolRegistry, type ToolRuntimeContext } from "../tools/registry"
import {
  GENERATION_CHECKPOINT_SCHEMA_VERSION,
  computeGenerationInputKeys,
  type GenerationCheckpoint,
  type StoredGenerationCheckpoint,
} from "./checkpoints"
import type { PreResolveOptions } from "./pre-resolve"
import type { RunRecorder } from "./telemetry"
import { runAgentWriter } from "./run-agent"

/**
 * Wiring gateway LLM di runtime Agent Profile: penolakan kunci (401) gagal permanen tanpa finalize,
 * finalize memakai gateway + sinyal eksternal, dan tool menerima sinyal agent loop. Agent, pre-resolve,
 * dan finalize di-mock; perilaku gateway sendiri diuji di src/core/shared/llm/gateway.test.ts.
 */

const mocks = vi.hoisted(() => ({
  buildWriterAgent: vi.fn(),
  finalize: vi.fn(),
  preResolve: vi.fn(),
  toolContexts: [] as ToolRuntimeContext[],
}))

vi.mock("./build-agent", () => ({ buildWriterAgent: mocks.buildWriterAgent }))
vi.mock("./finalize", () => ({ executeSingleFinalizeCall: mocks.finalize }))
vi.mock("./pre-resolve", () => ({ preResolveTaxonomyAndAuthor: mocks.preResolve }))

const PROBE_TOOL_ID = "test_signal_probe"
ToolRegistry.register({
  id: PROBE_TOOL_ID,
  label: "Probe sinyal",
  description: "Tool uji untuk menangkap konteks runtime.",
  category: "research",
  requirements: [],
  defaultLimit: 1,
  build: (ctx) => {
    mocks.toolContexts.push(ctx)
    return tool(async () => "ok", { name: PROBE_TOOL_ID, description: "probe", schema: z.object({}) })
  },
  summarize: () => "probe",
})

const LONG_ARTICLE = `## Sejarah Kopi Arabika\n\n${"Kopi arabika tumbuh di dataran tinggi dengan cita rasa kompleks. ".repeat(60)}`

const profile: AgentProfile = {
  ref: "preset:test-writer",
  name: "Test Writer",
  mode: "standard",
  temperature: 0.5,
  workflowPrompt: "Tulis artikel informatif.",
  toolIds: [PROBE_TOOL_ID],
  limits: { ...DEFAULT_STANDARD_LIMITS },
  version: 1,
}

const userKeys = {
  openrouterKey: "sk-or-v1-test",
  searchPreferences: { default_provider: "auto" },
} as DecryptedUserKeys

const request = WriterRequestSchema.parse({ content: { keyword: "kopi arabika" }, model: "acme/request-model" })

beforeEach(() => {
  mocks.buildWriterAgent.mockReset()
  mocks.finalize.mockReset()
  mocks.preResolve
    .mockReset()
    .mockResolvedValue({ categoryIds: [], categoryNames: [], tagNames: [], tagIds: [], degradedReasons: [] })
  mocks.toolContexts.length = 0
  vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("runAgentWriter + gateway LLM", () => {
  it("kunci OpenRouter ditolak (401) di agent loop → gagal permanen tanpa finalize call", async () => {
    mocks.buildWriterAgent.mockResolvedValue({
      invoke: async () => {
        throw new OpenRouterError("User not found.", 401)
      },
    })

    const result = await runAgentWriter({ request, profile, userKeys })

    expect(result).toMatchObject({
      success: false,
      stopReason: "failed_llm_auth_failed",
      model: "acme/request-model",
      error: { code: "LLM_AUTH_FAILED", retryable: false },
    })
    expect(mocks.finalize).not.toHaveBeenCalled()
  })

  it("loop terhenti transien → finalize memakai gateway run & sinyal eksternal (bukan sinyal timeout loop)", async () => {
    const external = new AbortController()
    mocks.buildWriterAgent.mockResolvedValue({
      invoke: async () => {
        throw new OpenRouterError("Service unavailable", 503)
      },
    })
    mocks.finalize.mockResolvedValue({ title: "Kopi Arabika", excerpt: "Ringkas.", markdownContent: LONG_ARTICLE })

    const result = await runAgentWriter({ request, profile, userKeys, abortSignal: external.signal })

    expect(result.success).toBe(true)
    expect(result.stopReason).toBe("finalized_after_agent_loop_interrupted")
    const [finalizeArgs] = mocks.finalize.mock.calls[0]
    expect(finalizeArgs.signal).toBe(external.signal)
    expect(finalizeArgs.gateway.model).toBe("acme/request-model")
    expect(mocks.buildWriterAgent.mock.calls[0][0].gateway).toBe(finalizeArgs.gateway)
  })

  it("tool & agent loop berbagi sinyal loop yang ikut batal saat run dibatalkan; finalize dilewati", async () => {
    const external = new AbortController()
    let loopSignal: AbortSignal | undefined
    mocks.buildWriterAgent.mockResolvedValue({
      invoke: async (_input: unknown, config: { signal: AbortSignal }) => {
        loopSignal = config.signal
        external.abort()
        throw new DOMException("This operation was aborted", "AbortError")
      },
    })

    const result = await runAgentWriter({ request, profile, userKeys, abortSignal: external.signal })

    const toolSignal = mocks.toolContexts[0]?.signal
    expect(toolSignal).toBe(loopSignal)
    expect(toolSignal?.aborted).toBe(true)
    expect(mocks.finalize).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: false, stopReason: "failed_timeout_exceeded" })
  })

  it("anggaran panggilan model habis (event model_call_limit) → finalize dengan alasan limit_reached", async () => {
    mocks.buildWriterAgent.mockImplementation(async ({ recorder }: { recorder: RunRecorder }) => ({
      invoke: async () => {
        recorder.recordEvent({ kind: "guard", tool: "model_call_limit", status: "blocked", durationMs: 0, summary: "habis" })
        return { messages: [{ content: "PEMBERITAHUAN SISTEM: batas habis." }] }
      },
    }))
    mocks.finalize.mockResolvedValue({ title: "Kopi Arabika", excerpt: "Ringkas.", markdownContent: LONG_ARTICLE })

    const result = await runAgentWriter({ request, profile, userKeys })

    expect(mocks.finalize.mock.calls[0][0].reason).toBe("limit_reached")
    expect(result).toMatchObject({ success: true, stopReason: "finalized_after_limit_reached" })
  })

  it("tanpa kunci BYOK → MISSING_API_KEY dan agent tidak dibangun", async () => {
    const result = await runAgentWriter({ request, profile, userKeys: { ...userKeys, openrouterKey: undefined } })

    expect(result).toMatchObject({ success: false, stopReason: "missing_api_key", error: { code: "MISSING_API_KEY" } })
    expect(mocks.buildWriterAgent).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Checkpoint & resume
// ---------------------------------------------------------------------------

const PRE_RESOLVED = {
  author: { id: 4, name: "Sari Penulis", bio: "Barista 10 tahun", slug: "sari" },
  categoryIds: [12],
  categoryNames: ["Kopi"],
  tagNames: ["kopi arabika"],
  tagIds: [301],
}

/** Catat satu panggilan LLM sukses ke ledger run (sama dengan callback gateway). */
function spend(recorder: RunRecorder, totalTokens: number, costUsd: number) {
  recorder.usage.recordSuccess({
    model: "acme/request-model",
    promptTokens: totalTokens - 10,
    completionTokens: 10,
    totalTokens,
    reasoningTokens: 0,
    cachedPromptTokens: 0,
    costUsd,
  })
}

/** Agent yang "menulis" naskah panjang dan memakai 1000 token. */
function writingAgent() {
  mocks.buildWriterAgent.mockImplementation(async ({ recorder }: { recorder: RunRecorder }) => ({
    invoke: async () => {
      spend(recorder, 1000, 0.01)
      recorder.trackSource({ url: "https://sumber.test/kopi", title: "Sumber Kopi" })
      recorder.featuredMediaId = 88
      recorder.inContentImages.push({
        subheading: "Biji",
        imageUrl: "https://wp.test/up/biji.jpg",
        originalUrl: "https://img.test/biji.jpg",
        altText: "Biji kopi",
        wpMediaId: 89,
      })
      return { messages: [{ content: `TITLE: Kopi Arabika\nEXCERPT: Ringkas.\n---\n${LONG_ARTICLE}` }] }
    },
  }))
}

const keys = computeGenerationInputKeys(request, profile)
const ZERO_USAGE = {
  calls: 0,
  failedCalls: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  cachedPromptTokens: 0,
  costUsd: null,
  byModel: [],
}

function storedPreResolve(overrides: Partial<StoredGenerationCheckpoint> = {}): StoredGenerationCheckpoint {
  return {
    step: "pre_resolve",
    schemaVersion: GENERATION_CHECKPOINT_SCHEMA_VERSION,
    data: { inputKey: keys.preResolve, preResolved: PRE_RESOLVED, usage: { ...ZERO_USAGE, calls: 1, totalTokens: 100 } },
    ...overrides,
  }
}

function storedDraft(dataOverrides: Record<string, unknown> = {}): StoredGenerationCheckpoint {
  return {
    step: "draft",
    schemaVersion: GENERATION_CHECKPOINT_SCHEMA_VERSION,
    data: {
      inputKey: keys.draft,
      model: "acme/penulis-asli",
      preResolved: PRE_RESOLVED,
      output: { title: "Kopi Arabika Tersimpan", excerpt: "Ringkasan tersimpan.", markdownContent: LONG_ARTICLE },
      stopReason: "completed",
      sources: [{ url: "https://sumber.test/kopi", title: "Sumber Kopi", snippet: null }],
      featuredImage: {
        title: "Sampul",
        imageUrl: "https://wp.test/up/sampul.jpg",
        originalUrl: "https://img.test/sampul.jpg",
        explanation: "Dipilih agen",
        wpMediaId: 88,
      },
      featuredMediaId: 88,
      inContentImages: [{ subheading: "Biji", imageUrl: "https://wp.test/up/biji.jpg", altText: "Biji kopi", wpMediaId: 89 }],
      usage: { ...ZERO_USAGE, calls: 6, totalTokens: 9000, costUsd: 0.09 },
      ...dataOverrides,
    },
  }
}

function checkpointEvents(recorder: RunRecorder, tool: string) {
  return recorder.getEvents().filter((event) => event.tool === tool)
}

describe("runAgentWriter — checkpoint langkah", () => {
  it("run baru menyimpan pre_resolve lalu draft (naskah mentah, konteks, media, pemakaian per langkah)", async () => {
    mocks.preResolve.mockImplementation(async ({ recorder }: PreResolveOptions) => {
      if (recorder) spend(recorder, 100, 0.001)
      return { ...PRE_RESOLVED, degradedReasons: [] }
    })
    writingAgent()
    const saved: GenerationCheckpoint[] = []

    const result = await runAgentWriter({
      request,
      profile,
      userKeys,
      checkpoints: { onCheckpoint: async (checkpoint) => (saved.push(checkpoint), true) },
    })

    expect(result.success).toBe(true)
    expect(saved.map((c) => c.step)).toEqual(["pre_resolve", "draft"])
    expect(saved.every((c) => c.schemaVersion === GENERATION_CHECKPOINT_SCHEMA_VERSION)).toBe(true)

    const [pre, draft] = saved
    expect(pre.data).toMatchObject({ inputKey: keys.preResolve, preResolved: PRE_RESOLVED, usage: { calls: 1, totalTokens: 100, costUsd: 0.001 } })
    expect(draft.data).toMatchObject({
      inputKey: keys.draft,
      model: "acme/request-model",
      preResolved: PRE_RESOLVED,
      stopReason: "completed",
      output: { title: "Kopi Arabika", markdownContent: expect.stringContaining("Sejarah Kopi Arabika") },
      sources: [{ url: "https://sumber.test/kopi", title: "Sumber Kopi" }],
      featuredMediaId: 88,
      inContentImages: [{ wpMediaId: 89 }],
      // Pemakaian langkah draft tidak memuat token pre_resolve.
      usage: { calls: 1, totalTokens: 1000, costUsd: 0.01, byModel: [{ model: "acme/request-model", totalTokens: 1000 }] },
    })
    expect(checkpointEvents(result.recorder, "checkpoint_save").map((e) => e.status)).toEqual(["ok", "ok"])
    expect(result.recorder.getSummary("completed")).toMatchObject({ tokensTotal: 1100, resumedSteps: [] })
  })

  it("resume dari pre_resolve: resolver tidak dipanggil ulang, hanya draft yang disimpan, token tidak dihitung ganda", async () => {
    writingAgent()
    const saved: GenerationCheckpoint[] = []

    const result = await runAgentWriter({
      request,
      profile,
      userKeys,
      checkpoints: { resume: [storedPreResolve()], onCheckpoint: (c) => (saved.push(c), true) },
    })

    expect(result.success).toBe(true)
    expect(mocks.preResolve).not.toHaveBeenCalled()
    expect(saved.map((c) => c.step)).toEqual(["draft"])
    expect(result.enrichment).toMatchObject({ categories: [12], tags: [301], author: 4 })
    expect(result.recorder.getSummary("completed")).toMatchObject({
      resumedSteps: ["pre_resolve"],
      tokensTotal: 1000,
      llmCalls: 1,
    })
    expect(checkpointEvents(result.recorder, "checkpoint_resume")[0]?.summary).toMatch(/checkpoint pre_resolve/)
  })

  it("resume dari draft: tanpa LLM sama sekali (agen, finalize, resolver), bahkan tanpa kunci BYOK", async () => {
    const onCheckpoint = vi.fn()

    const result = await runAgentWriter({
      request,
      profile,
      userKeys: { ...userKeys, openrouterKey: undefined },
      checkpoints: { resume: [storedPreResolve(), storedDraft()], onCheckpoint },
    })

    expect(mocks.buildWriterAgent).not.toHaveBeenCalled()
    expect(mocks.finalize).not.toHaveBeenCalled()
    expect(mocks.preResolve).not.toHaveBeenCalled()
    expect(onCheckpoint).not.toHaveBeenCalled()
    expect(mocks.toolContexts).toHaveLength(0)

    expect(result).toMatchObject({ success: true, stopReason: "completed", model: "acme/penulis-asli" })
    expect(result.article?.title).toBe("Kopi Arabika Tersimpan")
    expect(result.article?.contentHtml).toContain("<!-- wp:")
    // Media yang sudah diunggah tool dipulihkan: pipeline media tidak mengunggah ulang.
    expect(result.enrichment).toMatchObject({
      categories: [12],
      tags: [301],
      author: 4,
      featuredMedia: 88,
      featuredImage: { wpMediaId: 88 },
      inContentImages: [{ wpMediaId: 89 }],
    })
    expect(result.sources).toEqual([{ url: "https://sumber.test/kopi", title: "Sumber Kopi" }])

    const summary = result.recorder.getSummary("completed")
    expect(summary).toMatchObject({ resumedSteps: ["pre_resolve", "draft"], tokensTotal: 0, llmCalls: 0, costUsd: null, modelCalls: 0 })
    expect(checkpointEvents(result.recorder, "checkpoint_resume")[0]?.summary).toMatch(/9\.000 token/)
  })

  it.each([
    ["versi skema berbeda", { ...storedDraft(), schemaVersion: GENERATION_CHECKPOINT_SCHEMA_VERSION + 1 }, /versi skema berbeda/],
    ["input berubah (kata kunci lain)", storedDraft({ inputKey: "sidik-lama" }), /input artikel\/Agent Profile berubah/],
    ["data rusak (naskah terlalu pendek)", storedDraft({ output: { markdownContent: "pendek" } }), /data tidak valid/],
  ])("checkpoint draft %s diabaikan → generasi penuh dengan event telemetri", async (_label, checkpoint, reason) => {
    writingAgent()

    const result = await runAgentWriter({ request, profile, userKeys, checkpoints: { resume: [checkpoint] } })

    expect(result.success).toBe(true)
    expect(mocks.buildWriterAgent).toHaveBeenCalledTimes(1)
    expect(mocks.preResolve).toHaveBeenCalledTimes(1)
    const ignored = checkpointEvents(result.recorder, "checkpoint_resume")
    expect(ignored).toHaveLength(1)
    expect(ignored[0]).toMatchObject({ status: "blocked" })
    expect(ignored[0].summary).toMatch(reason)
    expect(result.recorder.getSummary("completed").resumedSteps).toEqual([])
  })

  it("sidik input: Agent Profile kustom yang diubah membatalkan draft, tetapi pre_resolve tetap dipakai", () => {
    const edited = computeGenerationInputKeys(request, { ...profile, updatedAt: "2026-10-15T00:00:00Z" })
    expect(edited.preResolve).toBe(keys.preResolve)
    expect(edited.draft).not.toBe(keys.draft)

    const otherSite = computeGenerationInputKeys({ ...request, site: { baseUrl: "https://lain.test" } }, profile)
    expect(otherSite.preResolve).not.toBe(keys.preResolve)
  })

  it("penyimpanan ditolak (klaim hilang) atau error tidak menggagalkan run; dicatat ke telemetri", async () => {
    writingAgent()
    const outcomes = [false, new Error("db putus")]

    const result = await runAgentWriter({
      request,
      profile,
      userKeys,
      checkpoints: {
        onCheckpoint: async () => {
          const next = outcomes.shift()
          if (next instanceof Error) throw next
          return next ?? true
        },
      },
    })

    expect(result.success).toBe(true)
    const events = checkpointEvents(result.recorder, "checkpoint_save")
    expect(events.map((e) => e.status)).toEqual(["blocked", "error"])
    expect(events[1].summary).toMatch(/gagal disimpan: db putus/)
  })

  it("run dibatalkan di tengah pre-resolve (lease hilang): hasil resolusi tidak disimpan & agen tidak dijalankan", async () => {
    const external = new AbortController()
    mocks.preResolve.mockImplementation(async () => {
      external.abort()
      return { categoryIds: [], categoryNames: [], tagNames: ["fallback heuristik"], tagIds: [], degradedReasons: [] }
    })
    mocks.buildWriterAgent.mockResolvedValue({
      invoke: async (_input: unknown, config: { signal: AbortSignal }) => {
        config.signal.throwIfAborted()
        throw new Error("tidak boleh sampai sini")
      },
    })
    const onCheckpoint = vi.fn(async () => true)

    const result = await runAgentWriter({ request, profile, userKeys, abortSignal: external.signal, checkpoints: { onCheckpoint } })

    expect(onCheckpoint).not.toHaveBeenCalled()
    expect(mocks.finalize).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: false, stopReason: "failed_timeout_exceeded" })
    expect(checkpointEvents(result.recorder, "checkpoint_save")[0]).toMatchObject({ status: "blocked" })
  })

  it("pre-resolve tidak lengkap (LLM/WordPress gagal → heuristik) tidak disimpan; draft tetap disimpan", async () => {
    mocks.preResolve.mockResolvedValue({ ...PRE_RESOLVED, degradedReasons: ["llm:quota", "wp_tags"] })
    writingAgent()
    const saved: GenerationCheckpoint[] = []

    const result = await runAgentWriter({
      request,
      profile,
      userKeys,
      checkpoints: { onCheckpoint: async (checkpoint) => (saved.push(checkpoint), true) },
    })

    expect(result.success).toBe(true)
    expect(saved.map((c) => c.step)).toEqual(["draft"])
    // Konteks yang dipakai naskah tetap tersimpan di draft, tanpa penanda internal.
    expect(saved[0].data.preResolved).toEqual(PRE_RESOLVED)
    const skipped = checkpointEvents(result.recorder, "checkpoint_save")[0]
    expect(skipped).toMatchObject({ status: "blocked" })
    expect(skipped.summary).toMatch(/tidak lengkap \(llm:quota, wp_tags\)/)
  })

  it("NUL (U+0000) dari LLM/scraping dibuang sebelum checkpoint & postprocess", async () => {
    mocks.buildWriterAgent.mockImplementation(async ({ recorder }: { recorder: RunRecorder }) => ({
      invoke: async () => {
        recorder.trackSource({ url: "https://sumber.test/a", title: "Judul\u0000", snippet: "isi\u0000 halaman" })
        return { messages: [{ content: `TITLE: Kopi\u0000 Arabika\nEXCERPT: Ringkas.\n---\n${LONG_ARTICLE}\u0000` }] }
      },
    }))
    const saved: GenerationCheckpoint[] = []

    const result = await runAgentWriter({
      request,
      profile,
      userKeys,
      checkpoints: { onCheckpoint: async (checkpoint) => (saved.push(checkpoint), true) },
    })

    const draft = saved.find((c) => c.step === "draft")
    expect(JSON.stringify(draft?.data)).not.toContain("\\u0000")
    expect(draft?.data).toMatchObject({ output: { title: "Kopi Arabika" }, sources: [{ title: "Judul", snippet: "isi halaman" }] })
    expect(result.article?.markdownContent).not.toContain("\u0000")
  })

  it("data draft yang tidak lolos skema resume tidak dikirim ke penyimpanan (telemetri error)", async () => {
    mocks.buildWriterAgent.mockImplementation(async ({ recorder }: { recorder: RunRecorder }) => ({
      invoke: async () => {
        recorder.featuredMediaId = -5
        return { messages: [{ content: `TITLE: Kopi\nEXCERPT: Ringkas.\n---\n${LONG_ARTICLE}` }] }
      },
    }))
    const saved: string[] = []

    const result = await runAgentWriter({
      request,
      profile,
      userKeys,
      checkpoints: { onCheckpoint: async (checkpoint) => (saved.push(checkpoint.step), true) },
    })

    expect(result.success).toBe(true)
    expect(saved).toEqual(["pre_resolve"])
    const rejected = checkpointEvents(result.recorder, "checkpoint_save").at(-1)
    expect(rejected).toMatchObject({ status: "error" })
    expect(rejected?.summary).toMatch(/data tidak valid \(featuredMediaId/)
  })

  it("naskah melebihi batas ukuran checkpoint tidak dikirim ke penyimpanan", async () => {
    mocks.buildWriterAgent.mockResolvedValue({
      invoke: async () => ({ messages: [{ content: `TITLE: Besar\n---\n## Bagian\n\n${"kata ".repeat(45_000)}` }] }),
    })
    const saved: string[] = []

    const result = await runAgentWriter({
      request,
      profile,
      userKeys,
      checkpoints: { onCheckpoint: async (checkpoint) => (saved.push(checkpoint.step), true) },
    })

    expect(result.success).toBe(true)
    expect(saved).toEqual(["pre_resolve"])
    expect(checkpointEvents(result.recorder, "checkpoint_save").at(-1)?.summary).toMatch(/melebihi batas/)
  })

  it("tool upload_media menerima kunci cache media (pemilik & situs) agar run ulang tidak mengunggah ulang", async () => {
    writingAgent()
    const withSite = WriterRequestSchema.parse({
      content: { keyword: "kopi arabika" },
      site: { siteId: "site-1", baseUrl: "https://wp.test", username: "editor", applicationPassword: "abcd efgh" },
    })

    await runAgentWriter({ request: withSite, profile, userKeys, userId: "user-1" })
    expect(mocks.toolContexts[0]?.mediaCache).toEqual({ userId: "user-1", siteId: "site-1" })

    mocks.toolContexts.length = 0
    await runAgentWriter({ request, profile, userKeys, userId: "user-1" })
    expect(mocks.toolContexts[0]?.mediaCache).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Taksonomi, author & media tidak pernah dari teks keluaran agen
// ---------------------------------------------------------------------------

/** Keluaran agen (dapat dipengaruhi konten web lewat web_reader) yang mencoba menimpa taksonomi/author/media. */
const HIJACK_FIELDS = { categoryIds: [999], authorId: 666, featuredMediaId: 555 }

describe("runAgentWriter — taksonomi, author & media terkunci", () => {
  beforeEach(() => {
    mocks.preResolve.mockResolvedValue({ ...PRE_RESOLVED, degradedReasons: [] })
  })

  it("categoryIds/authorId/featuredMediaId di teks agen diabaikan dan tidak ikut disimpan di checkpoint draft", async () => {
    mocks.buildWriterAgent.mockImplementation(async ({ recorder }: { recorder: RunRecorder }) => ({
      invoke: async () => {
        recorder.featuredMediaId = 88
        const output = { title: "Kopi Arabika", excerpt: "Ringkas.", markdownContent: LONG_ARTICLE, ...HIJACK_FIELDS }
        return { messages: [{ content: JSON.stringify(output) }] }
      },
    }))
    const saved: GenerationCheckpoint[] = []

    const result = await runAgentWriter({
      request,
      profile,
      userKeys,
      checkpoints: { onCheckpoint: async (checkpoint) => (saved.push(checkpoint), true) },
    })

    expect(result.success).toBe(true)
    expect(result.enrichment).toMatchObject({ categories: [12], author: 4, featuredMedia: 88, authorDetail: { id: 4 } })
    const draftOutput = saved.find((c) => c.step === "draft")?.data.output
    expect(Object.keys(draftOutput ?? {}).sort()).toEqual(["excerpt", "markdownContent", "title"])
  })

  it("pilihan pengguna > hasil Pre-Flight Resolver (kategori, author, featured image)", async () => {
    writingAgent()
    const chosen = WriterRequestSchema.parse({
      content: { keyword: "kopi arabika" },
      model: "acme/request-model",
      publishing: { mode: "draft", categoryIds: [7], authorId: 9, featuredImageId: 77 },
    })

    const result = await runAgentWriter({ request: chosen, profile, userKeys })

    expect(result.success).toBe(true)
    expect(result.enrichment).toMatchObject({ categories: [7], author: 9, featuredMedia: 77, tags: [301] })
    // Persona pre-resolve (author 4) bukan milik author yang dipakai: tidak dilaporkan.
    expect(result.enrichment?.authorDetail).toBeUndefined()
  })

  it("kategori per baris (nama) diteruskan ke resolver; kategori hasil pencocokannya mengalahkan ID kategori batch", async () => {
    writingAgent()
    const rowCategory = WriterRequestSchema.parse({
      content: { keyword: "kopi arabika" },
      model: "acme/request-model",
      publishing: { mode: "draft", categoryIds: [7], categoryNames: ["wisata kuliner"] },
    })

    const result = await runAgentWriter({ request: rowCategory, profile, userKeys })

    expect(mocks.preResolve.mock.calls[0][0]).toMatchObject({
      requestedCategoryIds: [7],
      requestedCategoryNames: ["wisata kuliner"],
    })
    expect(result.enrichment).toMatchObject({ categories: [12] })
  })

  it("tanpa pilihan pengguna: kategori & author dari pre-resolve, media dari tool set_featured_image", async () => {
    writingAgent()

    const result = await runAgentWriter({ request, profile, userKeys })

    expect(result.enrichment).toMatchObject({ categories: [12], author: 4, featuredMedia: 88, authorDetail: { id: 4 } })
  })

  it("checkpoint draft lama yang masih memuat field tersebut tetap di-resume; field-nya diabaikan", async () => {
    const legacy = storedDraft({
      output: { title: "Kopi Arabika Tersimpan", excerpt: "Ringkasan tersimpan.", markdownContent: LONG_ARTICLE, ...HIJACK_FIELDS },
    })

    const result = await runAgentWriter({ request, profile, userKeys, checkpoints: { resume: [storedPreResolve(), legacy] } })

    expect(mocks.buildWriterAgent).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: true, stopReason: "completed" })
    expect(result.recorder.getSummary("completed").resumedSteps).toEqual(["pre_resolve", "draft"])
    expect(result.enrichment).toMatchObject({ categories: [12], author: 4, featuredMedia: 88 })
  })
})

describe("runAgentWriter — prioritas model (Lab & antrean, resolve-model.ts)", () => {
  const keys = { ...userKeys, defaultAiModel: "acme/default-akun" } as DecryptedUserKeys
  const withoutRequestModel = WriterRequestSchema.parse({ content: { keyword: "kopi arabika" } })

  beforeEach(() => {
    mocks.buildWriterAgent.mockResolvedValue({
      invoke: async () => {
        throw new OpenRouterError("User not found.", 401)
      },
    })
  })

  it("model Agent Profile kustom mengalahkan default akun", async () => {
    const result = await runAgentWriter({
      request: withoutRequestModel,
      profile: { ...profile, ref: "4f6c1f5e-0000-4000-8000-000000000001", model: "acme/model-profil" },
      userKeys: keys,
    })

    expect(result.model).toBe("acme/model-profil")
  })

  it("preset bawaan memakai default akun walau membawa model sendiri", async () => {
    const result = await runAgentWriter({
      request: withoutRequestModel,
      profile: { ...profile, isPreset: true, model: "acme/model-preset" },
      userKeys: keys,
    })

    expect(result.model).toBe("acme/default-akun")
  })
})

// ---------------------------------------------------------------------------
// Kontrak keluaran naskah (TITLE/EXCERPT, judul, penolakan)
// ---------------------------------------------------------------------------

const PARAGRAPH = "Harga arabika Gayo naik tajam musim ini karena panen turun di dataran tinggi Aceh Tengah. "

function agentReplies(text: string) {
  mocks.buildWriterAgent.mockResolvedValue({ invoke: async () => ({ messages: [{ content: text }] }) })
}

describe("runAgentWriter — kontrak keluaran naskah", () => {
  it("system & user prompt memakai paket gaya bahasa artikel, daftar tool aktif, dan format TITLE/EXCERPT", async () => {
    agentReplies(`TITLE: Kopi Gayo\nEXCERPT: Ringkasan.\n---\n${LONG_ARTICLE}`)
    await runAgentWriter({ request: WriterRequestSchema.parse({ content: { keyword: "kopi", language: "en" } }), profile, userKeys })

    const { systemPrompt } = mocks.buildWriterAgent.mock.calls[0][0] as { systemPrompt: string }
    expect(systemPrompt).toContain("# WRITER GUARDRAILS")
    expect(systemPrompt).toContain("# WRITING STYLE: ENGLISH")
    expect(systemPrompt).toContain("Tulis artikel informatif.")
    expect(systemPrompt).not.toMatch(/\{\{\s*\w+\s*\}\}/)
  })

  it("naskah dibuka paragraf tanpa header: H2 pertama tetap subbab, bukan judul; excerpt dari pembuka", async () => {
    const body = `${PARAGRAPH.repeat(3)}\n\n## Mengapa Harga Melonjak\n\n${PARAGRAPH.repeat(20)}\n\n## Siapa yang Terdampak?\n\n${PARAGRAPH.repeat(20)}`
    agentReplies(body)

    const result = await runAgentWriter({ request, profile, userKeys })

    expect(result.success).toBe(true)
    expect(result.article?.title).toBe("kopi arabika")
    expect(result.article?.subheadings).toEqual(expect.arrayContaining(["Mengapa Harga Melonjak", "Siapa yang Terdampak?"]))
    expect(result.article?.excerpt).toContain("Harga arabika Gayo naik tajam")
  })

  it("judul wajib dari pengguna mengalahkan judul TITLE dari model", async () => {
    agentReplies(`TITLE: Judul Model\nEXCERPT: Ringkasan kopi.\n---\n${LONG_ARTICLE}`)
    const titled = WriterRequestSchema.parse({ content: { keyword: "kopi arabika", title: "Judul Pengguna" } })

    const result = await runAgentWriter({ request: titled, profile, userKeys })

    expect(result.article?.title).toBe("Judul Pengguna")
    expect(result.article?.excerpt).toBe("Ringkasan kopi.")
  })

  it("naskah terbagi di sela panggilan tool disambung utuh (bukan hanya pesan AI terakhir)", async () => {
    const opening = `${PARAGRAPH.repeat(3)}\n\n## Mengapa Harga Melonjak\n\n${PARAGRAPH.repeat(15)}`
    const rest = `## Siapa yang Terdampak?\n\n${PARAGRAPH.repeat(15)}`
    mocks.buildWriterAgent.mockResolvedValue({
      invoke: async () => ({
        messages: [
          { content: `TITLE: Harga Arabika Gayo Melonjak\nEXCERPT: Ringkasan harga.\n---\n${opening}` },
          { content: "hasil image_search", getType: () => "tool" },
          { content: rest },
        ],
      }),
    })

    const result = await runAgentWriter({ request, profile, userKeys })

    expect(result.article?.title).toBe("Harga Arabika Gayo Melonjak")
    expect(result.article?.subheadings).toEqual(["Mengapa Harga Melonjak", "Siapa yang Terdampak?"])
    expect(result.article?.markdownContent).not.toContain("hasil image_search")
    expect(mocks.finalize).not.toHaveBeenCalled()
  })

  it("penolakan topik (REFUSED:) → gagal permanen tanpa finalize call", async () => {
    agentReplies("REFUSED: Topik ini memfasilitasi penipuan.")

    const result = await runAgentWriter({ request, profile, userKeys })

    expect(result).toMatchObject({
      success: false,
      stopReason: "failed_content_refused",
      error: { code: "CONTENT_REFUSED", retryable: false },
    })
    expect(result.error?.message).toContain("memfasilitasi penipuan")
    expect(mocks.finalize).not.toHaveBeenCalled()
  })
})
