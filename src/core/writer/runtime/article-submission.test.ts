import { describe, expect, it } from "vitest"
import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages"
import type { ChatResult } from "@langchain/core/outputs"
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

function setup(script: Array<() => AIMessage>, target = 300) {
  const recorder = new RunRecorder()
  const submission = createArticleSubmission({ recorder, targetWordCount: target })
  const model = new ScriptedModel(script)
  const agent = createAgent({ model, tools: [], responseFormat: submission.responseFormat })
  return { recorder, submission, model, invoke: () => agent.invoke({ messages: [new HumanMessage("tulis")] }) }
}

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

  it("dua penyerahan dalam satu giliran → diminta menyerahkan sekali saja", async () => {
    const twice = () =>
      new AIMessage({
        content: "",
        tool_calls: [
          { id: "d1", name: ARTICLE_SUBMIT_TOOL, args: VALID, type: "tool_call" },
          { id: "d2", name: ARTICLE_SUBMIT_TOOL, args: VALID, type: "tool_call" },
        ],
      })
    const { model, invoke } = setup([twice, submit(VALID)])
    await invoke()
    expect(String(model.calls[1].messages.at(-1)?.content)).toContain(`call ${ARTICLE_SUBMIT_TOOL} exactly once per turn`)
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
