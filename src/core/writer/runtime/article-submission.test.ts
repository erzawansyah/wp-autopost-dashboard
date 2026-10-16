import { describe, expect, it } from "vitest"
import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages"
import type { ChatResult } from "@langchain/core/outputs"
import { createPatchToolCallsMiddleware } from "deepagents"
import { createAgent, tool } from "langchain"
import { z } from "zod"
import { ARTICLE_OUTPUT_RULES } from "./article-validation"
import { ARTICLE_FIELDS_JSON_SCHEMA, ARTICLE_SUBMIT_TOOL, createArticleSubmission } from "./article-submission"
import { RunRecorder } from "./telemetry"

/** Model berskrip: setiap panggilan mengembalikan pesan berikutnya dan mencatat tool/tool_choice yang di-bind. */
class ScriptedModel extends BaseChatModel {
  readonly calls: Array<{ toolChoice: unknown; tools: string[]; parameters: unknown[]; messages: BaseMessage[] }> = []

  constructor(private readonly script: Array<() => AIMessage>) {
    super({})
  }

  _llmType(): string {
    return "scripted"
  }

  get callKeys(): string[] {
    return [...super.callKeys, "tools", "tool_choice"]
  }

  bindTools(tools: unknown[], kwargs?: Record<string, unknown>) {
    return this.withConfig({ ...kwargs, tools } as never)
  }

  async _generate(messages: BaseMessage[], options: this["ParsedCallOptions"]): Promise<ChatResult> {
    const opts = options as unknown as { tools?: Array<{ function?: { name: string; parameters: unknown }; name?: string }>; tool_choice?: unknown }
    this.calls.push({
      toolChoice: opts.tool_choice,
      tools: (opts.tools ?? []).map((t) => t.function?.name ?? t.name ?? "?"),
      parameters: (opts.tools ?? []).map((t) => t.function?.parameters),
      messages,
    })
    const next = this.script.shift()
    if (!next) throw new Error("skrip model habis")
    return { generations: [{ text: "", message: next() }] }
  }
}

let callId = 0
const submit = (args: Record<string, unknown>) => () =>
  new AIMessage({ content: "", tool_calls: [{ id: `c${++callId}`, name: ARTICLE_SUBMIT_TOOL, args, type: "tool_call" }] })

const paragraph = "Harga arabika Gayo naik tajam musim ini karena panen turun di dataran tinggi Aceh Tengah. "
const sections = (count: number) =>
  Array.from({ length: count }, (_, i) => `## Subbab Bermakna Nomor ${i + 1}\n\n${paragraph.repeat(6)}`).join("\n\n")
const VALID = {
  title: "Harga Arabika Gayo Melonjak di Musim Panen",
  excerpt: "Harga arabika Gayo naik tajam musim ini. Simak penyebabnya, siapa yang paling terdampak, dan langkah yang bisa diambil kedai kecil agar tetap bertahan.",
  body: `${paragraph.repeat(2)}\n\n${sections(5)}`,
}

/** Tool gambar berskrip: mencatat setiap eksekusi. */
function imageTool(executed: string[]) {
  return tool(
    async ({ query }: { query: string }) => {
      executed.push(query)
      return "gambar dipasang"
    },
    { name: "set_featured_image", description: "pasang gambar", schema: z.object({ query: z.string() }) }
  )
}

/** Agen standard dengan susunan middleware penyerahan seperti `build-agent.ts`. */
function setup(
  script: Array<() => AIMessage>,
  options: { maxCorrectionRounds?: number; tools?: ReturnType<typeof imageTool>[] } = {}
) {
  const recorder = new RunRecorder()
  const submission = createArticleSubmission({ recorder, targetWordCount: 300, maxCorrectionRounds: options.maxCorrectionRounds })
  const model = new ScriptedModel(script)
  const agent = createAgent({
    model,
    tools: options.tools ?? [],
    responseFormat: submission.responseFormat,
    middleware: [createPatchToolCallsMiddleware(), submission.middleware],
  })
  return { recorder, submission, model, invoke: () => agent.invoke({ messages: [new HumanMessage("tulis")] }) }
}

/** ToolMessage yang diterima model pada panggilan ke-`index`. */
const toolMessagesAt = (model: ScriptedModel, index: number) =>
  model.calls[index].messages.filter((m): m is ToolMessage => ToolMessage.isInstance(m))
const toolCallIdsAt = (model: ScriptedModel, index: number) =>
  model.calls[index].messages.flatMap((m) => (AIMessage.isInstance(m) ? (m.tool_calls ?? []).map((call) => call.id) : []))

describe("createArticleSubmission", () => {
  it("tool extract-article ter-bind dengan parameter tiga field bersih dan tool_choice wajib", async () => {
    const { model, invoke } = setup([submit(VALID)])
    const result = await invoke()

    expect(result.structuredResponse).toEqual(VALID)
    expect(model.calls[0].tools).toEqual([ARTICLE_SUBMIT_TOOL])
    expect(model.calls[0].parameters).toEqual([ARTICLE_FIELDS_JSON_SCHEMA])
    expect(model.calls[0].toolChoice).toBe("any")
  })

  it("penyerahan tidak valid → semua pelanggaran dikirim balik dalam satu ToolMessage → diperbaiki", async () => {
    const bad = { ...VALID, title: "x".repeat(80), excerpt: "pendek", body: `# Judul\n\n${paragraph}\n\n${sections(2)}` }
    const { model, submission, recorder, invoke } = setup([submit(bad), submit(VALID)])
    const result = await invoke()

    expect(result.structuredResponse).toEqual(VALID)
    expect(model.calls).toHaveLength(2)
    const feedback = model.calls[1].messages.find((m): m is ToolMessage => ToolMessage.isInstance(m))
    const text = String(feedback?.content)
    expect(text).toContain("The article was NOT accepted")
    expect(text).toContain(`title: 80 characters (allowed ${ARTICLE_OUTPUT_RULES.titleMinChars}-${ARTICLE_OUTPUT_RULES.titleMaxChars})`)
    expect(text).toContain("excerpt: 6 characters")
    expect(text).toContain('body: 1 H1 heading(s) ("# ")')
    expect(text).toContain(`main sections ("## " headings), at least ${ARTICLE_OUTPUT_RULES.minH2Sections} required`)
    expect(text).toContain(`Remaining correction attempts: ${ARTICLE_OUTPUT_RULES.maxCorrectionRounds}`)
    expect(submission.attempts()).toBe(2)
    expect(submission.lastSubmission()).toEqual({ fields: VALID, issues: [] })
    expect(recorder.getEvents().map((e) => e.status)).toEqual(["blocked", "ok"])
  })

  it("setelah batas putaran koreksi, penyerahan berikutnya diterima apa adanya dan pelanggarannya dicatat", async () => {
    const bad = { ...VALID, excerpt: "pendek" }
    const rounds = ARTICLE_OUTPUT_RULES.maxCorrectionRounds
    const { model, submission, recorder, invoke } = setup(Array.from({ length: rounds + 1 }, () => submit(bad)))
    const result = await invoke()

    expect(result.structuredResponse).toEqual(bad)
    expect(model.calls).toHaveLength(rounds + 1)
    expect(submission.lastSubmission()?.issues).toEqual([expect.stringContaining("excerpt: 6 characters")])
    const last = recorder.getEvents().at(-1)
    expect(last).toMatchObject({ tool: ARTICLE_SUBMIT_TOOL, status: "error" })
    expect(last?.summary).toContain("diterima apa adanya")
  })

  it("field hilang ikut dihitung sebagai percobaan dan dilaporkan", async () => {
    const { model, invoke } = setup([submit({ title: VALID.title, body: VALID.body }), submit(VALID)])
    await invoke()
    expect(String(model.calls[1].messages.at(-1)?.content)).toContain("excerpt: missing or not a string")
  })

  it("judul wajib pengguna: aturan judul tidak berlaku (agen tidak terjebak koreksi judul)", async () => {
    const recorder = new RunRecorder()
    const submission = createArticleSubmission({ recorder, targetWordCount: 300, requiredTitle: "Judul Pengguna" })
    const model = new ScriptedModel([submit({ ...VALID, title: "" })])
    const result = await createAgent({ model, tools: [], responseFormat: submission.responseFormat }).invoke({
      messages: [new HumanMessage("tulis")],
    })
    expect(result.structuredResponse).toMatchObject({ title: "" })
    expect(model.calls).toHaveLength(1)
  })

  it("penolakan topik lewat title REFUSED: diterima tanpa koreksi dan dicatat", async () => {
    const { model, submission, invoke } = setup([submit({ title: "REFUSED: memfasilitasi penipuan", excerpt: "", body: "" })])
    await invoke()
    expect(model.calls).toHaveLength(1)
    expect(submission.refusal()).toBe("memfasilitasi penipuan")
  })

  it("penolakan hanya dengan title REFUSED: (excerpt/body tidak diisi) tetap dikenali tanpa koreksi", async () => {
    const { model, submission, invoke } = setup([submit({ title: "REFUSED: konten berbahaya" })])
    await invoke()
    expect(model.calls).toHaveLength(1)
    expect(submission.refusal()).toBe("konten berbahaya")
  })

  const twice = (args: Record<string, unknown>) => () =>
    new AIMessage({
      content: "",
      tool_calls: [
        { id: `d${++callId}`, name: ARTICLE_SUBMIT_TOOL, args, type: "tool_call" },
        { id: `d${++callId}`, name: ARTICLE_SUBMIT_TOOL, args, type: "tool_call" },
      ],
    })

  it("dua penyerahan valid dalam satu giliran → naskah pertama langsung diterima", async () => {
    const { model, submission, invoke } = setup([twice(VALID)])
    const result = await invoke()
    expect(result.structuredResponse).toEqual(VALID)
    expect(model.calls).toHaveLength(1)
    expect(submission.attempts()).toBe(1)
  })

  it("dua penyerahan tidak valid dalam satu giliran → pelanggaran sampai ke agen; sisa percobaan dihitung tepat", async () => {
    const bad = { ...VALID, excerpt: "pendek" }
    const { model, submission, invoke } = setup([twice(bad), submit(VALID)])
    const result = await invoke()
    expect(result.structuredResponse).toEqual(VALID)
    const feedback = toolMessagesAt(model, 1)
    const text = feedback.map((m) => String(m.content)).join("\n")
    expect(text).toContain(`call ${ARTICLE_SUBMIT_TOOL} exactly once per turn`)
    expect(text).toContain("excerpt: 6 characters")
    expect(text).not.toContain("cancelled")
    expect(text).toContain(`Remaining correction attempts: ${ARTICLE_OUTPUT_RULES.maxCorrectionRounds}`)
    // Setiap tool call di riwayat terjawab tepat satu kali.
    expect(feedback.map((m) => m.tool_call_id).sort()).toEqual(toolCallIdsAt(model, 1).sort())
    expect(submission.attempts()).toBe(2)
  })

  it("satu putaran koreksi: penyerahan ganda tidak valid tetap menerima pelanggaran sebelum diterima apa adanya", async () => {
    const bad = { ...VALID, excerpt: "pendek" }
    const { model, invoke } = setup([twice(bad), submit(VALID)], { maxCorrectionRounds: 1 })
    expect((await invoke()).structuredResponse).toEqual(VALID)
    expect(toolMessagesAt(model, 1).map((m) => String(m.content)).join("\n")).toContain("excerpt: 6 characters")
  })

  it("penyerahan ganda bersama tool lain → tool lain tidak hilang: dibatalkan, diulang, lalu naskah diserahkan sekali", async () => {
    const executed: string[] = []
    const withImage = () =>
      new AIMessage({
        content: "",
        tool_calls: [
          { id: "img1", name: "set_featured_image", args: { query: "kopi" }, type: "tool_call" },
          { id: `d${++callId}`, name: ARTICLE_SUBMIT_TOOL, args: VALID, type: "tool_call" },
          { id: `d${++callId}`, name: ARTICLE_SUBMIT_TOOL, args: VALID, type: "tool_call" },
        ],
      })
    const image = () =>
      new AIMessage({ content: "", tool_calls: [{ id: "img2", name: "set_featured_image", args: { query: "kopi" }, type: "tool_call" }] })
    const { model, invoke } = setup([withImage, image, submit(VALID)], { tools: [imageTool(executed)] })
    const result = await invoke()

    expect(result.structuredResponse).toEqual(VALID)
    expect(executed).toEqual(["kopi"])
    const feedback = toolMessagesAt(model, 1)
    expect(feedback.map((m) => m.tool_call_id).sort()).toEqual(toolCallIdsAt(model, 1).sort())
    expect(feedback.find((m) => m.tool_call_id === "img1")?.content).toContain("cancelled")
    expect(feedback.map((m) => String(m.content)).join("\n")).toContain("alone, in a turn after your other tool calls")
  })

  it("argumen terpotong tidak menimpa penyerahan utuh sebelumnya; batas panjang diberi tahu ke agen", async () => {
    const short = { ...VALID, excerpt: "pendek" }
    const cutOff = () =>
      new AIMessage({
        content: "",
        invalid_tool_calls: [
          { id: `x${++callId}`, name: ARTICLE_SUBMIT_TOOL, args: `{"title":"Judul","excerpt":"e","body":"${"kata ".repeat(80)}`, error: "bad json", type: "invalid_tool_call" },
        ],
        response_metadata: { finish_reason: "length" },
      })
    const rounds = ARTICLE_OUTPUT_RULES.maxCorrectionRounds
    const { model, submission, invoke } = setup([submit(short), ...Array.from({ length: rounds }, () => cutOff)])
    const result = await invoke()

    expect(result.structuredResponse).toBeUndefined()
    expect(submission.lastSubmission()).toMatchObject({ fields: short })
    expect(submission.lastSubmission()?.salvaged).toBeUndefined()
    expect(String(toolMessagesAt(model, 2).at(-1)?.content)).toContain("cut off at the output length limit")
  })

  it("tanpa penyerahan utuh, draf dari argumen terpotong diselamatkan dan ditandai", async () => {
    const cutOff = () =>
      new AIMessage({
        content: "",
        invalid_tool_calls: [
          { id: `x${++callId}`, name: ARTICLE_SUBMIT_TOOL, args: `{"title":"Judul","excerpt":"e","body":"${"kata ".repeat(80)}`, error: "bad json", type: "invalid_tool_call" },
        ],
      })
    const rounds = ARTICLE_OUTPUT_RULES.maxCorrectionRounds
    const { submission, invoke } = setup(Array.from({ length: rounds + 1 }, () => cutOff))
    await invoke()
    expect(submission.lastSubmission()).toMatchObject({ salvaged: true, fields: { title: "Judul" } })
  })

  it("tool riset biasa tetap berjalan sebelum penyerahan", async () => {
    const recorder = new RunRecorder()
    const submission = createArticleSubmission({ recorder, targetWordCount: 300 })
    const search = tool(async () => "hasil", { name: "web_search", description: "cari", schema: z.object({ query: z.string() }) })
    const model = new ScriptedModel([
      () => new AIMessage({ content: "", tool_calls: [{ id: "s1", name: "web_search", args: { query: "kopi" }, type: "tool_call" }] }),
      submit(VALID),
    ])
    const result = await createAgent({ model, tools: [search], responseFormat: submission.responseFormat }).invoke({
      messages: [new HumanMessage("tulis")],
    })
    expect(model.calls[0].tools).toEqual(["web_search", ARTICLE_SUBMIT_TOOL])
    expect(result.structuredResponse).toEqual(VALID)
  })
})
