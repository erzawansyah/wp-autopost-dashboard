import { describe, expect, it } from "vitest"
import { listUserGuides } from "./docs"

describe("listUserGuides", () => {
  it("hanya menyajikan panduan pengguna docs/guides/0N-*.md, urut nomor (dokumen internal dikecualikan)", async () => {
    const guides = await listUserGuides()
    const filenames = guides.map((guide) => guide.filename)

    expect(filenames.length).toBeGreaterThan(0)
    expect(filenames.every((name) => /^0\d-[a-z0-9-]+\.md$/.test(name))).toBe(true)
    expect(filenames).toEqual([...filenames].sort())
    expect(filenames).not.toContain("architecture-domain-placement-plan.md")
    expect(filenames).not.toContain("system-writer-architecture.md")
    expect(guides[0]).toEqual({
      slug: filenames[0].replace(/\.md$/, ""),
      filename: filenames[0],
      title: expect.any(String),
      content: expect.any(String),
      updatedAt: expect.any(String),
    })
  })
})
