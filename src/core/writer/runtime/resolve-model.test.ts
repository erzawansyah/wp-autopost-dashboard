import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"
import { getBuiltinProfile } from "../profiles/builtin"
import { resolveWriterModel, resolveWriterReasoningEffort, writerModelCandidates } from "./resolve-model"

/**
 * Prioritas model penulisan artikel (worker antrean & Lab): model per permintaan → model Agent Profile kustom →
 * default akun → model preset → env `OPENROUTER_DEFAULT_MODEL` → `DEFAULT_AI_MODEL`.
 */

const custom = { model: "acme/model-profil" }
const preset = { isPreset: true, model: "acme/model-preset" }

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("writerModelCandidates", () => {
  it("Agent Profile kustom dengan model eksplisit mengalahkan default akun; model per permintaan mengalahkan keduanya", () => {
    expect(writerModelCandidates({ profile: custom, userDefaultModel: "acme/default-akun" })).toEqual([
      "acme/model-profil",
      "acme/default-akun",
    ])
    expect(writerModelCandidates({ requestModel: "acme/request", profile: custom, userDefaultModel: "acme/default-akun" })[0]).toBe(
      "acme/request"
    )
  })

  it("preset bawaan tidak pernah mengalahkan default akun (model preset hanya cadangan)", () => {
    expect(writerModelCandidates({ profile: preset, userDefaultModel: "acme/default-akun" })).toEqual([
      "acme/default-akun",
      "acme/model-preset",
    ])
  })

  it("nilai kosong/spasi dibuang", () => {
    expect(writerModelCandidates({ requestModel: "  ", profile: { model: "" }, userDefaultModel: null })).toEqual([])
  })
})

describe("resolveWriterModel", () => {
  it("tanpa kandidat → env OPENROUTER_DEFAULT_MODEL → DEFAULT_AI_MODEL", () => {
    expect(resolveWriterModel({ profile: {}, userDefaultModel: " acme/default-akun " })).toBe("acme/default-akun")
    vi.stubEnv("OPENROUTER_DEFAULT_MODEL", "env/default")
    expect(resolveWriterModel({ profile: {} })).toBe("env/default")
    vi.stubEnv("OPENROUTER_DEFAULT_MODEL", "")
    expect(resolveWriterModel({ profile: {} })).toBe(DEFAULT_AI_MODEL)
  })
})

describe("resolveWriterReasoningEffort", () => {
  const deepPreset = { isPreset: true, reasoningEffort: "medium" as const }

  it("tanpa nilai akun ('Ikuti Agent Profile') preset memakai nilai bawaannya; kustom tanpa nilai → low", () => {
    expect(resolveWriterReasoningEffort({ profile: deepPreset })).toBe("medium")
    expect(resolveWriterReasoningEffort({ profile: deepPreset, userEffort: null })).toBe("medium")
    expect(resolveWriterReasoningEffort({ profile: {} })).toBe("low")
  })

  it("nilai akun berlaku juga untuk preset (mengalahkan nilai bawaan preset)", () => {
    expect(resolveWriterReasoningEffort({ profile: deepPreset, userEffort: "low" })).toBe("low")
    expect(resolveWriterReasoningEffort({ profile: { isPreset: true, reasoningEffort: "low" }, userEffort: "high" })).toBe("high")
  })

  it("nilai pada Agent Profile kustom mengalahkan nilai akun; nilai per permintaan mengalahkan semuanya", () => {
    expect(resolveWriterReasoningEffort({ profile: { reasoningEffort: "medium" }, userEffort: "high" })).toBe("medium")
    expect(resolveWriterReasoningEffort({ requestEffort: "high", profile: deepPreset, userEffort: "low" })).toBe("high")
  })

  it("preset bawaan sungguhan: Deep Research Specialist medium, Quick Writer low bila akun tidak menetapkan", () => {
    const quick = getBuiltinProfile("preset:quick-writer")
    const deep = getBuiltinProfile("preset:deep-research")
    if (!quick || !deep) throw new Error("Preset bawaan tidak ditemukan")
    expect(resolveWriterReasoningEffort({ profile: quick })).toBe("low")
    expect(resolveWriterReasoningEffort({ profile: deep })).toBe("medium")
    expect(resolveWriterReasoningEffort({ profile: deep, userEffort: "high" })).toBe("high")
  })
})
