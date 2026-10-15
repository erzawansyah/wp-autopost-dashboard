import { describe, expect, it } from "vitest"
import { CreateSkillFormSchema, UpdateSkillBodySchema, resolveSkillName } from "./skills"

const WITH_FRONTMATTER = "---\nname: Editor SEO\ndescription: Panduan\n---\n# Isi"

describe("resolveSkillName", () => {
  it("isian nama diutamakan, lalu name di frontmatter", () => {
    expect(resolveSkillName("Nama Isian", WITH_FRONTMATTER)).toBe("Nama Isian")
    expect(resolveSkillName("", WITH_FRONTMATTER)).toBe("Editor SEO")
    expect(resolveSkillName(undefined, "# tanpa frontmatter")).toBe("")
  })
})

describe("CreateSkillFormSchema", () => {
  it("nama boleh kosong bila frontmatter punya name", () => {
    expect(CreateSkillFormSchema.safeParse({ name: "", slug: "", description: "", content: WITH_FRONTMATTER }).success).toBe(true)
  })

  it("tanpa nama efektif → error di field name (selaras aturan service)", () => {
    const result = CreateSkillFormSchema.safeParse({ name: "", slug: "", description: "", content: "# Isi saja" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["name"])
  })

  it("isi SKILL.md wajib", () => {
    const result = CreateSkillFormSchema.safeParse({ name: "Nama", slug: "", description: "", content: "   " })
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("content")
  })
})

describe("UpdateSkillBodySchema", () => {
  it("form edit: nama minimal 2 karakter; body kosong ditolak", () => {
    expect(UpdateSkillBodySchema.safeParse({ name: "A", description: "", content: "x" }).success).toBe(false)
    expect(UpdateSkillBodySchema.safeParse({ name: "Ab", description: "", content: "x" }).success).toBe(true)
    expect(UpdateSkillBodySchema.safeParse({}).success).toBe(false)
  })
})
