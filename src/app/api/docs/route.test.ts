import { describe, expect, it } from "vitest"
import { GET } from "@/app/api/docs/route"

describe("GET /api/docs", () => {
  it("tanpa sesi dan hanya menyajikan panduan pengguna docs/guides/0N-*.md (dokumen internal dikecualikan)", async () => {
    const res = await GET(new Request("http://localhost/api/docs"), { params: Promise.resolve({}) })
    const body = await res.json()
    const filenames: string[] = body.docs.map((doc: { filename: string }) => doc.filename)

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(filenames.length).toBeGreaterThan(0)
    expect(filenames.every((name) => /^0\d-[a-z0-9-]+\.md$/.test(name))).toBe(true)
    expect(filenames).toEqual([...filenames].sort())
    expect(filenames).not.toContain("architecture-domain-placement-plan.md")
    expect(filenames).not.toContain("system-writer-architecture.md")
    expect(body.docs[0]).toEqual({
      slug: filenames[0].replace(/\.md$/, ""),
      filename: filenames[0],
      title: expect.any(String),
      content: expect.any(String),
      updatedAt: expect.any(String),
    })
  })
})
