import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"
import { resolveWriterModel, writerModelCandidates } from "./resolve-model"

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
