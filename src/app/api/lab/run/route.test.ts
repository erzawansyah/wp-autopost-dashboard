import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "@/app/api/lab/run/route"
import { REDACTED } from "@/core/writer/runtime/redact"

/** Lab: konten artikel/keluaran tool tidak boleh rusak oleh redaksi, log eksekusi tetap disamarkan. */

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  toolGet: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) } }),
}))
vi.mock("@/lib/constants/auth", () => ({ hasLabAccess: async () => true }))
vi.mock("@/lib/settings/user-keys", () => ({
  getUserDecryptedKeys: async () => ({ searchPreferences: { default_provider: "auto" }, notificationPrefs: {} }),
}))
vi.mock("@/lib/crypto", () => ({ decryptCredential: vi.fn() }))
vi.mock("@/core/writer", () => ({ run: mocks.run }))
vi.mock("@/core/writer/tools", () => ({ ToolRegistry: { get: mocks.toolGet } }))
vi.mock("@/core/shared/tools/wordpress-publisher", () => ({ publishPostToWordPress: vi.fn() }))
vi.mock("@/core/shared/tools/web-search", () => ({ webSearch: vi.fn() }))
vi.mock("@/core/shared/tools/image-search", () => ({ searchRoyaltyFreeImages: vi.fn() }))
vi.mock("@/core/shared/tools/keyword-suggestions", () => ({ getKeywordSuggestions: vi.fn() }))
vi.mock("@/core/shared/tools/web-reader", () => ({ readWebContent: vi.fn() }))

const SIGNED_IMAGE_URL = "https://cdn.contoh.test/foto.jpg?token=tk_9f8e7d6c5b4a3f2e1d&w=1200"

function labRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/lab/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mocks.run.mockReset()
  mocks.toolGet.mockReset()
})

describe("POST /api/lab/run — redaksi terarah", () => {
  it("artikel & enrichment utuh, log eksekusi dan error tetap diredaksi", async () => {
    const article = {
      title: "Basic Training: Authorization dasar untuk pemula",
      contentHtml: `<p>Bearer of bad news.</p><img src="${SIGNED_IMAGE_URL}" />`,
    }
    mocks.run.mockResolvedValue({
      success: false,
      article,
      enrichment: { categories: [1], tags: [], featuredImage: { imageUrl: SIGNED_IMAGE_URL } },
      execution: {
        engine: "preset:quick-writer",
        nodesExecuted: ["input_validator"],
        nodeLogs: [
          {
            node: "input_validator",
            input: { site: { baseUrl: "https://wp.test", applicationPassword: "abcd efgh ijkl mnop" } },
            output: {},
          },
        ],
        durationMs: 1,
        retries: 0,
        modelUsed: "x",
        warnings: [],
      },
      error: { code: "X", message: "HTTP 401 ?api_key=sk-rahasia-123", retryable: false },
    })

    const res = await POST(labRequest({ type: "agent", targetId: "preset:quick-writer", params: {} }))
    const body = await res.json()

    expect(body.article).toEqual(article)
    expect(body.output.article).toEqual(article)
    expect(body.enrichment.featuredImage.imageUrl).toBe(SIGNED_IMAGE_URL)
    expect(body.execution.nodeLogs[0].input.site.applicationPassword).toBe(REDACTED)
    expect(body.execution.nodeLogs[0].input.site.baseUrl).toBe("https://wp.test")
    expect(body.error).toBe(`HTTP 401 ?api_key=${REDACTED}`)
    expect(JSON.stringify(body)).not.toContain("abcd efgh ijkl mnop")
    expect(JSON.stringify(body)).not.toContain("sk-rahasia-123")
  })

  it("keluaran tool generik: properti rahasia disamarkan, URL & field struktural utuh", async () => {
    mocks.toolGet.mockReturnValue({
      build: () => ({
        invoke: async () =>
          JSON.stringify({ url: SIGNED_IMAGE_URL, primaryKey: 42, apiKey: "sk-or-v1-abcdef0123456789" }),
      }),
    })

    const res = await POST(labRequest({ type: "tool", targetId: "upload_media", params: {} }))
    const body = await res.json()

    expect(body.output).toEqual({ url: SIGNED_IMAGE_URL, primaryKey: 42, apiKey: REDACTED })
  })
})
