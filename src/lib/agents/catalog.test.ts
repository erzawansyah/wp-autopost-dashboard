import { describe, expect, it } from "vitest"
import { DEFAULT_STANDARD_LIMITS } from "@/core/writer/types/profile"
import { toAgentProfileCatalog, toSkillSummary } from "./catalog"

describe("toAgentProfileCatalog", () => {
  it("ringkasan tanpa workflow prompt/batas; mode tak dikenal → standard; flag boolean pasti", () => {
    const catalog = toAgentProfileCatalog({
      presets: [
        {
          ref: "preset:quick-writer",
          name: "Quick Writer",
          mode: "standard",
          temperature: 0.95,
          workflowPrompt: "PROMPT PANJANG",
          toolIds: [],
          limits: DEFAULT_STANDARD_LIMITS,
          isPreset: true,
          isDefault: true,
        },
      ],
      userProfiles: [
        {
          id: "p1",
          ref: "p1",
          name: "Profil",
          description: null,
          mode: "aneh",
          temperature: 0.5,
          workflowPrompt: "PROMPT",
          toolIds: ["web_search"],
          limits: DEFAULT_STANDARD_LIMITS,
        },
      ],
    })

    expect(catalog.presets[0]).toEqual({
      ref: "preset:quick-writer",
      name: "Quick Writer",
      description: "",
      mode: "standard",
      toolIds: [],
      isPreset: true,
      isDefault: true,
    })
    expect(catalog.userProfiles[0]).toMatchObject({ ref: "p1", mode: "standard", isPreset: false, isDefault: false })
    expect(JSON.stringify(catalog)).not.toContain("PROMPT")
  })
})

describe("toSkillSummary", () => {
  it("membuang isi SKILL.md", () => {
    const summary = toSkillSummary({
      id: "s1",
      user_id: null,
      name: "Skill",
      slug: "skill",
      description: null,
      content: "# Isi rahasia panjang",
      is_system: true,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    })
    expect(summary).not.toHaveProperty("content")
    expect(summary).toMatchObject({ id: "s1", slug: "skill", is_system: true })
  })
})
