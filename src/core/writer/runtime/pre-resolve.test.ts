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

    expect(result).toMatchObject({ author: { id: 3 }, categoryIds: [7], tagIds: [45] })
    expect(wp.fetchWordPressUsers).toHaveBeenCalledWith({ ...wpCredentials, signal: controller.signal })
    expect(wp.fetchWordPressCategories).toHaveBeenCalledWith({ ...wpCredentials, signal: controller.signal })
    expect(wp.wpFetch.mock.calls[0][1]).toMatchObject({ signal: controller.signal })
    expect(wp.resolveOrCreateWordPressTags.mock.calls[0][0]).toMatchObject({ signal: controller.signal })
  })
})
