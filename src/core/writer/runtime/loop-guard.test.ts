import { describe, expect, it, vi } from "vitest"
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages"
import { createAgent, FakeToolCallingModel, ToolInvocationError } from "langchain"
import { ToolInputParsingException } from "@langchain/core/tools"
import { toolFailure, toolSuccess, type ToolErrorCode } from "@/core/shared/tools/contract"
import { createLoopGuardMiddleware } from "@/core/writer/runtime/loop-guard"
import { RunRecorder } from "@/core/writer/runtime/telemetry"
import { ToolRegistry } from "@/core/writer/tools"
import { readToolArtifact } from "@/core/writer/tools/tool-response"
import type { AgentLimits } from "@/core/writer/types/profile"

/**
 * Loop guard membaca kegagalan dari artifact `ToolOutcome` (bukan teks "ERROR[...]") dan menjaga empat
 * jaminan: dedupe panggilan identik, circuit breaker (2× gagal berturut-turut / kegagalan tingkat-tool),
 * kuota global & per-tool, serta pembatalan run tidak dihitung sebagai kegagalan tool.
 */

type Middleware = ReturnType<typeof createLoopGuardMiddleware>
type WrapToolCall = NonNullable<Middleware["wrapToolCall"]>
type ToolCallRequest = Parameters<WrapToolCall>[0]
type ToolCallHandler = Parameters<WrapToolCall>[1]

const LIMITS: AgentLimits = { maxModelCalls: 10, maxToolCalls: 0, timeoutSeconds: 60, minWordCount: 300, perTool: {} }

let callSeq = 0
function request(name: string, args: Record<string, unknown>, signal?: AbortSignal): ToolCallRequest {
  callSeq += 1
  return {
    toolCall: { name, args, id: `call_${callSeq}`, type: "tool_call" },
    tool: undefined,
    state: { messages: [] },
    runtime: { signal },
  } as unknown as ToolCallRequest
}

function okMessage(content = "Ditemukan 1 sumber web: ...", name = "web_search"): ToolMessage {
  return new ToolMessage({
    content,
    tool_call_id: "x",
    name,
    artifact: toolSuccess({ query: "q", results: [{ title: "A", url: "https://a.test", snippet: "s", source: "brave" }] }),
  })
}

function failMessage(code: ToolErrorCode, name = "web_search"): ToolMessage {
  return new ToolMessage({ content: `ERROR[${code}]: gagal`, tool_call_id: "x", name, artifact: toolFailure(code, "gagal") })
}

function setup(limits: AgentLimits = LIMITS) {
  const recorder = new RunRecorder()
  const wrap = createLoopGuardMiddleware({ maxConsecutiveFailures: 2, limits }, recorder).wrapToolCall as WrapToolCall
  const run = async (req: ToolCallRequest, handler: ToolCallHandler): Promise<ToolMessage> => {
    const result = await wrap(req, handler)
    if (!ToolMessage.isInstance(result)) throw new Error("hasil guard harus ToolMessage")
    return result
  }
  return { recorder, run }
}

describe("circuit breaker berbasis artifact", () => {
  it("2× ok:false berturut-turut menonaktifkan tool; panggilan berikutnya → circuit_open tanpa eksekusi", async () => {
    const { recorder, run } = setup()
    const handler = vi.fn(async () => failMessage("timeout"))

    await run(request("web_search", { query: "a" }), handler)
    await run(request("web_search", { query: "b" }), handler)
    const blocked = await run(request("web_search", { query: "c" }), handler)

    expect(handler).toHaveBeenCalledTimes(2)
    expect(blocked.status).toBe("error")
    expect(readToolArtifact(blocked)).toMatchObject({ ok: false, code: "circuit_open", retryable: false })
    expect(blocked.content).toContain("Do NOT call tool 'web_search' again")
    expect(recorder.getEvents().map((e) => [e.kind, e.status])).toEqual([
      ["tool_call", "error"],
      ["guard", "blocked"],
      ["tool_call", "error"],
      ["guard", "disabled"],
    ])
  })

  it("sukses di antaranya mereset hitungan kegagalan", async () => {
    const { run } = setup()
    const handler = vi
      .fn<ToolCallHandler>()
      .mockResolvedValueOnce(failMessage("not_found"))
      .mockResolvedValueOnce(okMessage())
      .mockResolvedValueOnce(failMessage("not_found"))
      .mockResolvedValueOnce(okMessage("lagi"))

    for (const query of ["a", "b", "c", "d"]) await run(request("web_search", { query }), handler)
    expect(handler).toHaveBeenCalledTimes(4)
  })

  it.each(["missing_credentials", "unauthorized"] as const)(
    "kegagalan tingkat-tool (%s) langsung membuka breaker",
    async (code) => {
      const { recorder, run } = setup()
      const handler = vi.fn(async () => failMessage(code, "upload_media"))

      await run(request("upload_media", { imageUrl: "https://a.test/1.jpg" }), handler)
      const blocked = await run(request("upload_media", { imageUrl: "https://a.test/2.jpg" }), handler)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(readToolArtifact(blocked)).toMatchObject({ code: "circuit_open" })
      expect(recorder.getEvents().some((e) => e.summary.includes(`kegagalan tingkat-tool [${code}]`))).toBe(true)
    }
  )

  it("teks berisi 'ERROR:' dengan artifact sukses BUKAN kegagalan (tanpa parsing string)", async () => {
    const { run } = setup()
    const handler = vi.fn(async () => okMessage("--- KONTEN HALAMAN ---\nLog server: ERROR: disk penuh"))

    for (const query of ["a", "b", "c"]) {
      const result = await run(request("web_search", { query }), handler)
      expect(result.status).not.toBe("error")
    }
    expect(handler).toHaveBeenCalledTimes(3)
  })

  it("artifact ok:false terdeteksi walau konten tidak diawali ERROR; status pesan diselaraskan ke error", async () => {
    const { recorder, run } = setup()
    const handler = vi.fn(
      async () =>
        new ToolMessage({ content: "teks bebas", tool_call_id: "x", name: "web_search", artifact: toolFailure("rate_limited", "429") })
    )

    const result = await run(request("web_search", { query: "a" }), handler)
    expect(result.status).toBe("error")
    expect(readToolArtifact(result)).toMatchObject({ code: "rate_limited", retryable: true })
    expect(recorder.getEvents()[0]).toMatchObject({ kind: "tool_call", status: "error" })
    expect(recorder.getEvents()[0].summary).toMatch(/^Gagal \[rate_limited\]/)
  })

  it("tool di luar kontrak (tanpa artifact) memakai ToolMessage.status", async () => {
    const { run } = setup()
    const handler = vi.fn(
      async () => new ToolMessage({ content: "Error: file not found", tool_call_id: "x", name: "read_file", status: "error" })
    )

    await run(request("read_file", { path: "/a" }), handler)
    await run(request("read_file", { path: "/b" }), handler)
    const blocked = await run(request("read_file", { path: "/c" }), handler)

    expect(handler).toHaveBeenCalledTimes(2)
    expect(readToolArtifact(blocked)).toMatchObject({ code: "circuit_open" })
  })

  it("galat argumen (ToolInvocationError) → invalid_input; galat lain → kegagalan bertipe", async () => {
    const { run } = setup()
    const invalid = await run(request("web_search", { query: 1 }), async () => {
      throw new ToolInvocationError(new ToolInputParsingException("Received tool input did not match expected schema"), {
        name: "web_search",
        args: { query: 1 },
        id: "x",
      })
    })
    expect(invalid.status).toBe("error")
    expect(invalid.content).toMatch(/^ERROR\[invalid_input\]: Argumen tool tidak valid/)
    expect(invalid.content).not.toContain("at ")

    const crashed = await run(request("web_search", { query: "z" }), async () => {
      throw new Error("boom ke 10.0.0.5")
    })
    expect(readToolArtifact(crashed)).toMatchObject({ ok: false, code: "upstream_error" })
    expect(String(crashed.content)).not.toContain("10.0.0.5")
  })

  it("pembatalan run diteruskan sebagai galat dan tidak dihitung kegagalan tool", async () => {
    const { recorder, run } = setup()
    const controller = new AbortController()
    controller.abort()

    await expect(
      run(request("web_search", { query: "a" }, controller.signal), async () => {
        throw new DOMException("aborted", "AbortError")
      })
    ).rejects.toThrow("aborted")
    expect(recorder.getEvents()).toEqual([])
  })
})

describe("deduplikasi", () => {
  it("panggilan identik setelah sukses memakai hasil & artifact tersimpan", async () => {
    const { recorder, run } = setup()
    const first = okMessage()
    const handler = vi.fn(async () => first)

    await run(request("web_search", { query: "a", limit: 3 }), handler)
    const deduped = await run(request("web_search", { limit: 3, query: "a" }), handler)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(deduped.content).toContain("CACHED RESULT")
    expect(deduped.content).toContain("Ditemukan 1 sumber web")
    expect(readToolArtifact(deduped)).toEqual(readToolArtifact(first))
    expect(recorder.getEvents().at(-1)).toMatchObject({ kind: "guard", status: "deduped" })
  })

  it("hasil gagal tidak di-cache: argumen sama dieksekusi ulang", async () => {
    const { run } = setup()
    const handler = vi.fn<ToolCallHandler>().mockResolvedValueOnce(failMessage("timeout")).mockResolvedValueOnce(okMessage())

    await run(request("web_search", { query: "a" }), handler)
    const retried = await run(request("web_search", { query: "a" }), handler)

    expect(handler).toHaveBeenCalledTimes(2)
    expect(readToolArtifact(retried)).toMatchObject({ ok: true })
  })
})

describe("kuota", () => {
  it("kuota global: panggilan setelah batas → quota_exceeded untuk tool apa pun", async () => {
    const { run } = setup({ ...LIMITS, maxToolCalls: 2 })
    const handler = vi.fn(async () => okMessage())

    await run(request("web_search", { query: "a" }), handler)
    await run(request("web_search", { query: "b" }), handler)
    const blocked = await run(request("web_reader", { url: "https://a.test" }), handler)

    expect(handler).toHaveBeenCalledTimes(2)
    expect(blocked.status).toBe("error")
    expect(readToolArtifact(blocked)).toMatchObject({ ok: false, code: "quota_exceeded", retryable: false })
    expect(blocked.content).toContain("Batas total panggilan tool sistem (2 kali) telah tercapai.")
    expect(blocked.content).toContain("Do NOT call any tool again")
  })

  it("kuota per-tool hanya memblokir tool itu; panggilan diblokir tidak membuka breaker", async () => {
    const { run } = setup({ ...LIMITS, perTool: { web_search: 1 } })
    const handler = vi.fn(async () => okMessage())

    await run(request("web_search", { query: "a" }), handler)
    for (const query of ["b", "c", "d"]) {
      expect(readToolArtifact(await run(request("web_search", { query }), handler))).toMatchObject({
        code: "quota_exceeded",
      })
    }
    await run(request("web_reader", { url: "https://a.test" }), async () => okMessage("halaman", "web_reader"))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe("integrasi createAgent (ToolNode → wrapToolCall → artifact)", () => {
  it("web_reader nyata pada URL terblokir SSRF: 2 kegagalan lalu breaker, artifact sampai ke riwayat pesan", async () => {
    const recorder = new RunRecorder()
    const webReader = ToolRegistry.get("web_reader")!.build({
      userKeys: { searchPreferences: {} },
      language: "id",
      recorder,
    })
    const call = (id: string, url: string) => [{ name: "web_reader", args: { url }, id }]
    const model = new FakeToolCallingModel({
      toolCalls: [
        call("1", "http://169.254.169.254/a"),
        call("2", "http://127.0.0.1/b"),
        call("3", "https://example.com/c"),
        [],
      ],
    })

    const agent = createAgent({
      model,
      tools: [webReader],
      middleware: [createLoopGuardMiddleware({ maxConsecutiveFailures: 2, limits: LIMITS }, recorder)],
    })
    const result = await agent.invoke({ messages: [new HumanMessage("tulis artikel")] })

    const toolMessages = result.messages.filter((m): m is ToolMessage => ToolMessage.isInstance(m))
    const codes = toolMessages.map((m) => {
      const artifact = readToolArtifact(m)
      return artifact && !artifact.ok ? artifact.code : "ok"
    })
    expect(codes).toEqual([
      "blocked_ssrf",
      "blocked_ssrf",
      "circuit_open",
    ])
    expect(toolMessages.every((m) => m.status === "error")).toBe(true)
    expect(AIMessage.isInstance(result.messages.at(-1))).toBe(true)
    expect(recorder.getEvents().filter((e) => e.kind === "tool_call").map((e) => e.summary)).toEqual([
      expect.stringMatching(/^Gagal \[blocked_ssrf\]/),
      expect.stringMatching(/^Gagal \[blocked_ssrf\]/),
    ])
  })
})
