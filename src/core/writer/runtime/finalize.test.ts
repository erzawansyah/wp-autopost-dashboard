import { describe, expect, it, vi } from "vitest"
import { AIMessageChunk } from "@langchain/core/messages"
import type { LlmGateway } from "@/core/shared/llm/gateway"
import { ARTICLE_FIELDS_JSON_SCHEMA } from "./article-submission"
import { executeSingleFinalizeCall } from "./finalize"
import { RunRecorder } from "./telemetry"

const PARAGRAPH = "Harga arabika Gayo naik tajam musim ini karena panen turun di dataran tinggi Aceh Tengah. "
const BODY = `${PARAGRAPH.repeat(2)}\n\n${Array.from({ length: 5 }, (_, i) => `## Bagian ${i + 1}\n\n${PARAGRAPH.repeat(3)}`).join("\n\n")}`

function gatewayReplying(content: string) {
  const invoke = vi.fn(async () => new AIMessageChunk({ content }))
  return { gateway: { invoke } as unknown as LlmGateway, invoke }
}

function run(content: string, title?: string) {
  const { gateway, invoke } = gatewayReplying(content)
  const recorder = new RunRecorder()
  const result = executeSingleFinalizeCall({
    gateway,
    systemPrompt: "sistem",
    keyword: "kopi gayo",
    title,
    language: "id",
    targetWordCount: 300,
    recorder,
    reason: "limit_reached",
  })
  return { result, invoke, recorder }
}

describe("executeSingleFinalizeCall", () => {
  it("meminta JSON tiga field (json_schema) dan memakai field apa adanya", async () => {
    const { result, invoke } = run(JSON.stringify({ title: "Harga Gayo Melonjak Tajam", excerpt: "Ringkasan.", body: BODY }))

    expect(await result).toEqual({
      kind: "article",
      article: { title: "Harga Gayo Melonjak Tajam", excerpt: "Ringkasan.", markdownContent: BODY },
    })
    const [messages, options] = invoke.mock.calls[0] as unknown as [Array<{ content: string }>, { jsonSchema: unknown }]
    expect(options.jsonSchema).toEqual({ name: "article", schema: ARTICLE_FIELDS_JSON_SCHEMA })
    expect(messages[1].content).toContain('exactly the keys "title", "excerpt", and "body"')
    expect(messages[1].content).toContain("ARTICLE FIELDS")
  })

  it("pelanggaran aturan field hanya dicatat (tanpa koreksi); judul wajib pengguna menang", async () => {
    const { result, recorder } = run(JSON.stringify({ title: "Judul Model", excerpt: "pendek", body: BODY }), "Judul Pengguna")

    expect(await result).toMatchObject({ kind: "article", article: { title: "Judul Pengguna", excerpt: "pendek" } })
    const guard = recorder.getEvents().find((e) => e.tool === "finalize_output")
    expect(guard?.summary).toContain("excerpt: 6 characters")
  })

  it("penolakan lewat title REFUSED: → kind refused", async () => {
    const { result } = run(JSON.stringify({ title: "REFUSED: berbahaya", excerpt: "", body: "" }))
    expect(await result).toEqual({ kind: "refused", reason: "berbahaya" })
  })

  it("JSON terpotong dengan key body diselamatkan; teks Markdown bebas tetap diterima", async () => {
    const truncated = `{"title": "Harga Gayo", "excerpt": "Ringkas.", "body": "${BODY.replace(/\n/g, "\\n").slice(0, 600)}`
    expect(await run(truncated).result).toMatchObject({ kind: "article", article: { title: "Harga Gayo" } })
    expect(await run(`TITLE: Kopi Gayo\nEXCERPT: Ringkas.\n---\n${BODY}`).result).toMatchObject({
      kind: "article",
      article: { title: "Kopi Gayo", markdownContent: BODY.trim() },
    })
  })
})
