import { describe, expect, it } from "vitest"
import type { OpenRouterModelInfo } from "@/lib/ai/settings"
import { filterOpenRouterModels, formatContextLength } from "@/components/molecules/openrouter-model-picker"

const models: OpenRouterModelInfo[] = [
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", description: "Cepat & andal" },
  { id: "meta/llama-guard", name: "Llama Guard" },
  { id: "qwen/qwen3-235b", name: "Qwen3 235B" },
]

const ids = (list: OpenRouterModelInfo[]) => list.map((model) => model.id)

describe("filterOpenRouterModels", () => {
  it("tanpa kata kunci & provider Semua → semua model", () => {
    expect(filterOpenRouterModels(models, "  ", "Semua")).toHaveLength(models.length)
  })

  it("mencocokkan ID, nama, dan deskripsi tanpa beda huruf besar", () => {
    expect(ids(filterOpenRouterModels(models, "GPT", "Semua"))).toEqual(["openai/gpt-4o-mini"])
    expect(ids(filterOpenRouterModels(models, "andal", "Semua"))).toEqual(["meta-llama/llama-3.3-70b-instruct"])
  })

  it("filter Meta mencakup prefix meta-llama/ dan meta/", () => {
    expect(ids(filterOpenRouterModels(models, "", "Meta"))).toEqual(["meta-llama/llama-3.3-70b-instruct", "meta/llama-guard"])
  })

  it("kata kunci dan provider digabung (AND)", () => {
    expect(filterOpenRouterModels(models, "guard", "Qwen")).toEqual([])
  })
})

describe("formatContextLength", () => {
  it("ribuan → k, jutaan → M, kosong → null", () => {
    expect(formatContextLength(131072)).toBe("131k ctx")
    expect(formatContextLength(1048576)).toBe("1M ctx")
    expect(formatContextLength(undefined)).toBeNull()
  })
})
