import { describe, expect, it } from "vitest"
import settingsConfig from "@/core/shared/settings.json"
import {
  AgentLimitsInputSchema,
  AgentModeSchema,
  DEFAULT_DEEP_LIMITS,
  DEFAULT_STANDARD_LIMITS,
  SYSTEM_LIMIT_BOUNDS,
  clampLimits,
  parseStoredAgentLimits,
  readStoredIsDefault,
  resolveStoredAgentLimits,
} from "./profile"

describe("clampLimits — default per mode", () => {
  it("tanpa argumen memakai default mode standard", () => {
    expect(clampLimits()).toEqual(DEFAULT_STANDARD_LIMITS)
  })

  it("mode deep tanpa limits memakai default deep (bukan standard)", () => {
    const result = clampLimits(undefined, "deep")
    expect(result).toEqual(DEFAULT_DEEP_LIMITS)
    expect(result.maxModelCalls).toBe(settingsConfig.deepLimits.maxModelCalls)
    expect(result.maxModelCalls).not.toBe(settingsConfig.standardLimits.maxModelCalls)
  })

  it("nilai yang tidak diisi diisi dari default mode yang dipilih", () => {
    const result = clampLimits({ maxModelCalls: 20 }, "deep")
    expect(result.maxModelCalls).toBe(20)
    expect(result.maxToolCalls).toBe(DEFAULT_DEEP_LIMITS.maxToolCalls)
    expect(result.timeoutSeconds).toBe(DEFAULT_DEEP_LIMITS.timeoutSeconds)
    expect(result.minWordCount).toBe(DEFAULT_DEEP_LIMITS.minWordCount)
  })

  it("nilai pengguna dalam rentang dipertahankan apa adanya", () => {
    const input = { maxModelCalls: 10, maxToolCalls: 12, timeoutSeconds: 200, minWordCount: 1000 }
    expect(clampLimits(input, "standard")).toMatchObject(input)
  })

  it("NaN diperlakukan sebagai tidak diisi", () => {
    expect(clampLimits({ maxModelCalls: Number.NaN }).maxModelCalls).toBe(DEFAULT_STANDARD_LIMITS.maxModelCalls)
  })

  it("argumen tertukar (mode, limits) ditolak oleh type-checker", () => {
    const swappedCall = () =>
      // @ts-expect-error — regresi bug Fase 0: mode adalah argumen kedua, bukan pertama.
      clampLimits("deep", { maxModelCalls: 20 })
    expect(typeof swappedCall).toBe("function")
  })
})

describe("clampLimits — batas sistem (hard ceiling)", () => {
  it("memotong nilai di atas batas maksimum sistem", () => {
    const result = clampLimits({
      maxModelCalls: 10_000,
      maxToolCalls: 10_000,
      timeoutSeconds: 10_000,
      minWordCount: 1_000_000,
    })
    expect(result.maxModelCalls).toBe(SYSTEM_LIMIT_BOUNDS.maxModelCalls)
    expect(result.maxToolCalls).toBe(SYSTEM_LIMIT_BOUNDS.maxToolCalls)
    expect(result.timeoutSeconds).toBe(SYSTEM_LIMIT_BOUNDS.maxTimeoutSeconds)
    expect(result.minWordCount).toBe(SYSTEM_LIMIT_BOUNDS.maxWordCount)
  })

  it("menaikkan nilai di bawah batas minimum sistem", () => {
    const result = clampLimits({ maxModelCalls: 0, maxToolCalls: -5, timeoutSeconds: 1, minWordCount: 10 }, "deep")
    expect(result.maxModelCalls).toBe(SYSTEM_LIMIT_BOUNDS.minModelCalls)
    expect(result.maxToolCalls).toBe(SYSTEM_LIMIT_BOUNDS.minToolCalls)
    expect(result.timeoutSeconds).toBe(SYSTEM_LIMIT_BOUNDS.minTimeoutSeconds)
    expect(result.minWordCount).toBe(SYSTEM_LIMIT_BOUNDS.minWordCount)
  })

  it("membulatkan nilai pecahan", () => {
    expect(clampLimits({ maxModelCalls: 10.6 }).maxModelCalls).toBe(11)
    expect(clampLimits({ timeoutSeconds: 120.4 }).timeoutSeconds).toBe(120)
  })
})

describe("clampLimits — kuota per-tool", () => {
  it("mewarisi kuota per-tool default sesuai mode", () => {
    expect(clampLimits(undefined, "standard").perTool).toEqual(settingsConfig.standardLimits.perTool)
    expect(clampLimits(undefined, "deep").perTool).toEqual(settingsConfig.deepLimits.perTool)
  })

  it("override pengguna digabung dengan default tanpa menghapus tool lain", () => {
    const result = clampLimits({ perTool: { web_reader: 2 } }, "deep")
    expect(result.perTool.web_reader).toBe(2)
    expect(result.perTool.web_search).toBe(DEFAULT_DEEP_LIMITS.perTool.web_search)
  })

  it("kuota per-tool dijepit ke rentang 1..defaultPerToolLimit dan dibulatkan", () => {
    const result = clampLimits({ perTool: { web_search: 999, web_reader: 0, image_search: 2.6 } })
    expect(result.perTool.web_search).toBe(SYSTEM_LIMIT_BOUNDS.defaultPerToolLimit)
    expect(result.perTool.web_reader).toBe(1)
    expect(result.perTool.image_search).toBe(3)
  })

  it("nilai per-tool NaN diabaikan dan default tetap berlaku", () => {
    const result = clampLimits({ perTool: { web_search: Number.NaN } })
    expect(result.perTool.web_search).toBe(DEFAULT_STANDARD_LIMITS.perTool.web_search)
  })

  it("membuang kuota untuk tool yang tidak punya kuota bawaan (mis. tool lama list_wp_*)", () => {
    const result = clampLimits({ perTool: { list_wp_tags: 3, web_search: 2 } })
    expect(result.perTool).not.toHaveProperty("list_wp_tags")
    expect(result.perTool.web_search).toBe(2)
  })

  it("tidak memutasi objek default", () => {
    const result = clampLimits({ perTool: { web_search: 1 } })
    expect(result.perTool).not.toBe(DEFAULT_STANDARD_LIMITS.perTool)
    expect(DEFAULT_STANDARD_LIMITS.perTool.web_search).toBe(settingsConfig.standardLimits.perTool.web_search)
  })
})

describe("settings.json — kuota per-tool", () => {
  const removedAdminTools = ["list_wp_categories", "list_wp_tags", "list_wp_authors"]

  it("tidak lagi memuat kuota untuk tool administratif WordPress yang sudah dihapus", () => {
    for (const toolId of removedAdminTools) {
      expect(DEFAULT_STANDARD_LIMITS.perTool).not.toHaveProperty(toolId)
      expect(DEFAULT_DEEP_LIMITS.perTool).not.toHaveProperty(toolId)
    }
  })

  it("memiliki kuota set_featured_image (standard 2, deep 3)", () => {
    expect(DEFAULT_STANDARD_LIMITS.perTool.set_featured_image).toBe(2)
    expect(DEFAULT_DEEP_LIMITS.perTool.set_featured_image).toBe(3)
  })
})

describe("AgentModeSchema", () => {
  it("menerima standard/deep dan menolak mode lain dengan pesan berbahasa Indonesia", () => {
    expect(AgentModeSchema.parse("deep")).toBe("deep")
    const result = AgentModeSchema.safeParse("turbo")
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe("Mode agen harus 'standard' atau 'deep'.")
  })
})

describe("AgentLimitsInputSchema", () => {
  it("null diperlakukan sebagai tidak diisi sehingga clampLimits memakai default mode", () => {
    const parsed = AgentLimitsInputSchema.parse({ maxModelCalls: null, maxToolCalls: 20 })
    expect(parsed.maxModelCalls).toBeUndefined()
    const result = clampLimits(parsed, "deep")
    expect(result.maxModelCalls).toBe(DEFAULT_DEEP_LIMITS.maxModelCalls)
    expect(result.maxToolCalls).toBe(20)
  })

  it("membuang kunci tak dikenal seperti isDefault dari JSONB tersimpan", () => {
    const parsed = AgentLimitsInputSchema.parse({ maxModelCalls: 12, isDefault: true })
    expect(parsed).not.toHaveProperty("isDefault")
  })

  it("menolak nilai non-angka dengan pesan berbahasa Indonesia", () => {
    const result = AgentLimitsInputSchema.safeParse({ maxModelCalls: "12" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe("Setiap nilai batas eksekusi (limits) harus berupa angka.")
  })

  it("menolak limits yang bukan objek", () => {
    const result = AgentLimitsInputSchema.safeParse("deep")
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe("Batas eksekusi (limits) harus berupa objek.")
  })

  it("hanya menerima kuota per-tool untuk tool yang punya kuota bawaan", () => {
    expect(AgentLimitsInputSchema.safeParse({ perTool: { set_featured_image: 2 } }).success).toBe(true)
    const result = AgentLimitsInputSchema.safeParse({ perTool: { list_wp_tags: 2 } })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/^Kuota per-tool hanya berlaku untuk tool: .*set_featured_image/)
  })
})

describe("parseStoredAgentLimits — baris agent_profiles tersimpan", () => {
  const legacyRow = {
    maxModelCalls: 20,
    maxToolCalls: 25,
    timeoutSeconds: 300,
    minWordCount: 900,
    isDefault: true,
    perTool: { list_wp_categories: 3, list_wp_tags: 2, list_wp_authors: 1, web_search: 7 },
  }

  it("validasi ketat menolak baris lama, parser longgar mempertahankan nilai valid", () => {
    expect(AgentLimitsInputSchema.safeParse(legacyRow).success).toBe(false)

    expect(parseStoredAgentLimits(legacyRow)).toEqual({
      maxModelCalls: 20,
      maxToolCalls: 25,
      timeoutSeconds: 300,
      minWordCount: 900,
      perTool: { web_search: 7 },
    })
  })

  it("membuang nilai non-angka per kunci tanpa menggagalkan kunci lain", () => {
    expect(
      parseStoredAgentLimits({ maxModelCalls: "12", maxToolCalls: 9, timeoutSeconds: null, perTool: { web_reader: "x" } })
    ).toEqual({ maxToolCalls: 9 })
  })

  it("nilai bukan objek menghasilkan undefined (default mode)", () => {
    expect(parseStoredAgentLimits(null)).toBeUndefined()
    expect(parseStoredAgentLimits("deep")).toBeUndefined()
    expect(parseStoredAgentLimits([1, 2])).toBeUndefined()
  })

  it("resolveStoredAgentLimits menjepit sesuai mode baris dan tidak menjatuhkan batas ke default", () => {
    const result = resolveStoredAgentLimits(legacyRow, "deep")
    expect(result.maxModelCalls).toBe(20)
    expect(result.perTool.web_search).toBe(7)
    expect(result.perTool).not.toHaveProperty("list_wp_tags")
    expect(result.perTool.web_reader).toBe(DEFAULT_DEEP_LIMITS.perTool.web_reader)

    expect(resolveStoredAgentLimits(undefined, "mode-tak-dikenal")).toEqual(DEFAULT_STANDARD_LIMITS)
  })
})

describe("readStoredIsDefault — penanda default di limits JSONB", () => {
  it("hanya true bila limits.isDefault bernilai boolean true", () => {
    expect(readStoredIsDefault({ isDefault: true, maxModelCalls: 5 })).toBe(true)
    expect(readStoredIsDefault({ isDefault: false })).toBe(false)
    expect(readStoredIsDefault({ isDefault: "true" })).toBe(false)
    expect(readStoredIsDefault({})).toBe(false)
  })

  it("nilai bukan objek dianggap bukan default", () => {
    expect(readStoredIsDefault(null)).toBe(false)
    expect(readStoredIsDefault(undefined)).toBe(false)
    expect(readStoredIsDefault([true])).toBe(false)
  })
})
