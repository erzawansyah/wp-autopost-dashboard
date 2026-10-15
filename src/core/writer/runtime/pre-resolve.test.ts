import { beforeEach, describe, expect, it, vi } from "vitest"

/** Pre-Flight Resolver meneruskan sinyal pembatalan run ke setiap request WordPress. */

const wp = vi.hoisted(() => ({
  fetchWordPressUsers: vi.fn(),
  fetchWordPressCategories: vi.fn(),
  resolveOrCreateWordPressTags: vi.fn(),
  wpFetch: vi.fn(),
}))

vi.mock("@/lib/wordpress/client", () => ({
  ...wp,
  normalizeAndValidateWpUrl: (url: string) => ({ valid: true, normalizedUrl: url }),
  makeAuthHeader: () => "Basic dGVzdA==",
}))

import type { LlmGateway } from "@/core/shared/llm/gateway"
import { preResolveTaxonomyAndAuthor } from "./pre-resolve"

const wpCredentials = { baseUrl: "https://wp.test", username: "editor", applicationPassword: "abcd efgh" }

beforeEach(() => {
  wp.fetchWordPressUsers.mockReset().mockResolvedValue({ ok: true, users: [{ id: 3, name: "Sari", slug: "sari", description: "Barista" }] })
  wp.fetchWordPressCategories.mockReset().mockResolvedValue({ ok: true, categories: [{ id: 7, name: "Kopi", slug: "kopi", count: 1, parent: 0 }] })
  wp.resolveOrCreateWordPressTags.mockReset().mockResolvedValue([45])
  wp.wpFetch.mockReset().mockResolvedValue(new Response("[]", { status: 200 }))
})

describe("preResolveTaxonomyAndAuthor — sinyal run", () => {
  it("users, kategori, tag (cuplikan & pembuatan) menerima sinyal eksternal run", async () => {
    const controller = new AbortController()

    const result = await preResolveTaxonomyAndAuthor({ wpCredentials, keyword: "kopi arabika", signal: controller.signal })

    expect(result).toMatchObject({ author: { id: 3 }, categoryIds: [7], tagIds: [45], degradedReasons: [] })
    expect(wp.fetchWordPressUsers).toHaveBeenCalledWith({ ...wpCredentials, signal: controller.signal })
    expect(wp.fetchWordPressCategories).toHaveBeenCalledWith({ ...wpCredentials, signal: controller.signal })
    expect(wp.wpFetch.mock.calls[0][1]).toMatchObject({ signal: controller.signal })
    expect(wp.resolveOrCreateWordPressTags.mock.calls[0][0]).toMatchObject({ signal: controller.signal })
  })
})

describe("preResolveTaxonomyAndAuthor — hasil tidak lengkap (degraded)", () => {
  it("users/kategori/tag WordPress gagal → ditandai, tetap mengembalikan fallback heuristik", async () => {
    wp.fetchWordPressUsers.mockResolvedValue({ ok: false, error: "HTTP 503" })
    wp.fetchWordPressCategories.mockRejectedValue(new Error("ECONNRESET"))
    wp.wpFetch.mockResolvedValue(new Response("err", { status: 500 }))
    wp.resolveOrCreateWordPressTags.mockResolvedValue([])

    const result = await preResolveTaxonomyAndAuthor({ wpCredentials, keyword: "kopi arabika" })

    expect(result.degradedReasons).toEqual(["wp_users", "wp_categories", "wp_tags", "wp_tag_create"])
    expect(result.tagNames.length).toBeGreaterThan(0)
  })

  it("LLM resolver gagal (mis. kredit habis) → fallback heuristik ditandai llm:<jenis>", async () => {
    const gateway = {
      hasKey: true,
      completeJson: vi.fn(async () => {
        throw Object.assign(new Error("Insufficient credits"), { statusCode: 402 })
      }),
    } as unknown as LlmGateway

    const result = await preResolveTaxonomyAndAuthor({ wpCredentials, keyword: "kopi arabika", gateway })

    expect(gateway.completeJson).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ author: { id: 3 }, categoryIds: [7], degradedReasons: ["llm:quota"] })
  })

  it("tanpa kredensial WordPress (sandbox Lab) bukan degradasi", async () => {
    expect((await preResolveTaxonomyAndAuthor({ keyword: "kopi" })).degradedReasons).toEqual([])
  })
})
