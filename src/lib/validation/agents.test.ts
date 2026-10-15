import { describe, expect, it } from "vitest"
import {
  AGENT_PROFILE_INPUT_BOUNDS,
  DEFAULT_DEEP_LIMITS,
  DEFAULT_STANDARD_LIMITS,
  SYSTEM_LIMIT_BOUNDS,
  clampLimits,
} from "@/core/writer/types/profile"
import {
  AGENT_LIMIT_KEYS,
  AgentProfileFormSchema,
  AgentRefParamsSchema,
  CreateAgentProfileBodyBaseSchema,
  agentProfileFormValues,
  clampAgentLimit,
  defaultAgentLimits,
  limitsForModeChange,
  newAgentProfileFormValues,
  toAgentProfileBody,
  type AgentProfileFormOutput,
} from "./agents"

const UUID = "11111111-1111-4111-8111-111111111111"

describe("AgentRefParamsSchema", () => {
  it("menerima UUID dan preset:* (termasuk ter-encode), menolak selainnya", () => {
    expect(AgentRefParamsSchema.parse({ id: UUID }).id).toBe(UUID)
    expect(AgentRefParamsSchema.parse({ id: "preset%3Aquick-writer" }).id).toBe("preset:quick-writer")
    expect(AgentRefParamsSchema.safeParse({ id: "bukan-id" }).success).toBe(false)
    expect(AgentRefParamsSchema.safeParse({ id: "preset:../x" }).success).toBe(false)
  })
})

describe("batas eksekusi editor", () => {
  it("clampAgentLimit sama dengan clampLimits() server (rentang, pembulatan, kosong → default mode)", () => {
    for (const key of AGENT_LIMIT_KEYS) {
      for (const value of [-5, 0, 7.6, 10_000, Number.NaN]) {
        expect(clampAgentLimit(key, value, "deep")).toBe(clampLimits({ [key]: value }, "deep")[key])
      }
    }
    expect(clampAgentLimit("maxModelCalls", 999, "standard")).toBe(SYSTEM_LIMIT_BOUNDS.maxModelCalls)
    expect(clampAgentLimit("timeoutSeconds", Number.NaN, "deep")).toBe(DEFAULT_DEEP_LIMITS.timeoutSeconds)
  })

  it("ganti mode: batas default ikut pindah, batas yang sudah disesuaikan dipertahankan", () => {
    const standard = defaultAgentLimits("standard")
    expect(limitsForModeChange(standard, "standard", "deep")).toEqual(defaultAgentLimits("deep"))
    const custom = { ...standard, maxToolCalls: 3 }
    expect(limitsForModeChange(custom, "standard", "deep")).toBe(custom)
    expect(limitsForModeChange(standard, "standard", "standard")).toBe(standard)
  })

  it("toAgentProfileBody menjepit batas sesuai mode sebelum dikirim", () => {
    const values = AgentProfileFormSchema.parse({
      ...newAgentProfileFormValues("Gunakan `web_search`."),
      name: "Reporter",
      mode: "deep",
      limits: { maxModelCalls: 1000, maxToolCalls: -1, timeoutSeconds: 61.4, minWordCount: 800 },
    }) satisfies AgentProfileFormOutput
    expect(toAgentProfileBody(values).limits).toEqual({
      maxModelCalls: SYSTEM_LIMIT_BOUNDS.maxModelCalls,
      maxToolCalls: SYSTEM_LIMIT_BOUNDS.minToolCalls,
      timeoutSeconds: 61,
      minWordCount: 800,
    })
  })
})

describe("AgentProfileFormSchema", () => {
  it("nilai awal profil baru lolos validasi setelah nama diisi; keluaran = body POST yang sah", () => {
    const defaults = newAgentProfileFormValues("Tulis artikel.")
    expect(defaults.limits).toEqual(defaultAgentLimits("standard"))
    expect(AgentProfileFormSchema.safeParse(defaults).success).toBe(false)

    const output = AgentProfileFormSchema.parse({ ...defaults, name: "  Reporter  ", toolIds: ["web_search", "web_search"] })
    expect(output.name).toBe("Reporter")
    expect(output.toolIds).toEqual(["web_search"])
    expect(CreateAgentProfileBodyBaseSchema.safeParse(toAgentProfileBody(output)).success).toBe(true)
  })

  it("pesan error per field mengikuti batas input Agent Profile", () => {
    const result = AgentProfileFormSchema.safeParse({
      ...newAgentProfileFormValues("x".repeat(AGENT_PROFILE_INPUT_BOUNDS.workflowPromptMax + 1)),
      name: "A",
    })
    const issues = Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]))
    expect(issues.name).toBe(`Nama profil agen minimal ${AGENT_PROFILE_INPUT_BOUNDS.nameMin} karakter.`)
    expect(issues.workflowPrompt).toBe(`Workflow prompt maksimal ${AGENT_PROFILE_INPUT_BOUNDS.workflowPromptMax} karakter.`)
  })
})

describe("agentProfileFormValues", () => {
  const source = {
    name: "Research & Media Writer",
    description: null,
    mode: "standard",
    temperature: 0.7,
    workflowPrompt: "Prompt",
    toolIds: ["web_search"],
    limits: { ...DEFAULT_STANDARD_LIMITS, maxToolCalls: 9 },
    isDefault: true,
  }

  it("edit: nilai tersimpan dipakai apa adanya", () => {
    const values = agentProfileFormValues({ ...source, skills: [] })
    expect(values).toMatchObject({ name: source.name, description: "", isDefault: true, skills: [] })
    expect(values.limits.maxToolCalls).toBe(9)
  })

  it("kloning: nama (Salinan) tetap dalam batas, bukan default, preset tanpa skill → skill bawaan", () => {
    const values = agentProfileFormValues({ ...source, name: "N".repeat(AGENT_PROFILE_INPUT_BOUNDS.nameMax) }, { clone: true })
    expect(values.name.endsWith(" (Salinan)")).toBe(true)
    expect(values.name).toHaveLength(AGENT_PROFILE_INPUT_BOUNDS.nameMax)
    expect(values.isDefault).toBe(false)
    expect(values.skills).toEqual(["anti-ai-editor"])
  })

  it("mode tak dikenal diperlakukan standard", () => {
    expect(agentProfileFormValues({ ...source, mode: "lainnya" }).mode).toBe("standard")
  })
})
