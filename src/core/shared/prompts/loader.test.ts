import { describe, expect, it, vi } from "vitest"
import {
  FALLBACK_PROMPT_VERSION,
  createPromptVersionTracker,
  getPromptVersion,
  loadParsedPrompt,
  loadPrompt,
  loadSectionedPrompt,
  renderPrompt,
} from "./loader"
import { PROMPT_REGISTRY } from "./registry.generated"

const entries = Object.values(PROMPT_REGISTRY)
const withBothSections = entries.find((e) => e.systemPrompt && e.userPromptTemplate)
const withOutputSchema = entries.find((e) => e.outputSchema)

describe("loader — resolusi nama dari registry (tanpa disk)", () => {
  it("nama dengan & tanpa .md menghasilkan isi yang sama", () => {
    expect(loadPrompt("system-guardrail.md")).toBe(loadPrompt("system-guardrail"))
    expect(loadPrompt("  agent-user-prompt.md ")).toBe(PROMPT_REGISTRY["agent-user-prompt"].userPromptTemplate)
  })

  it("prompt satu section mengembalikan section itu; prompt dua section memilih lewat argumen", () => {
    expect(loadPrompt("system-guardrail.md")).toBe(PROMPT_REGISTRY["system-guardrail"].systemPrompt)
    expect(withBothSections).toBeDefined()
    if (!withBothSections) return
    expect(loadPrompt(withBothSections.name, "", "system")).toBe(withBothSections.systemPrompt)
    expect(loadPrompt(withBothSections.name, "", "user")).toBe(withBothSections.userPromptTemplate)
    expect(loadPrompt(withBothSections.name)).toBe(withBothSections.body)
  })

  it("nama tidak terdaftar melempar error yang jelas (tanpa menebak prefix)", () => {
    expect(() => loadPrompt("guardrail.md")).toThrow(/Prompt "guardrail.md" tidak terdaftar.*npm run prompts:build/)
    expect(() => loadSectionedPrompt("tools-categories-suggest.md")).toThrow(/tidak terdaftar/)
    expect(() => loadParsedPrompt("preset-quick-writer")).toThrow(/tidak terdaftar/)
    expect(() => loadPrompt("../prompts/system-guardrail.md")).toThrow(/tidak terdaftar/)
    expect(() => getPromptVersion("tidak-ada")).toThrow(/tidak terdaftar/)
  })

  it("loadPrompt(file, fallback) mengembalikan fallback satu kalimat untuk nama tidak terdaftar", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(loadPrompt("system-tidak-ada.md", "  Patuhi aturan WordPress.  ")).toBe("Patuhi aturan WordPress.")
    expect(warn).toHaveBeenCalledOnce()
  })

  it("loadSectionedPrompt memuat metadata, output schema, dan versi", () => {
    expect(withOutputSchema).toBeDefined()
    if (!withOutputSchema) return
    const prompt = loadSectionedPrompt(`${withOutputSchema.name}.md`)
    expect(prompt.outputSchema).toEqual(withOutputSchema.outputSchema)
    expect(prompt.metadata?.description).toBe(withOutputSchema.description)
    expect(prompt.metadata?.used_by).toEqual(withOutputSchema.usedBy)
    expect(prompt.metadata?.variables).toEqual(withOutputSchema.variables)
    expect(prompt.version).toBe(getPromptVersion(withOutputSchema.name))
  })

  it("hasil dapat dimutasi pemanggil tanpa mengubah registry bersama", () => {
    expect(withOutputSchema).toBeDefined()
    if (!withOutputSchema) return
    const first = loadParsedPrompt(withOutputSchema.name)
    first.outputSchema!.type = "dirusak"
    first.metadata.used_by!.push("dirusak.ts")
    const second = loadParsedPrompt(withOutputSchema.name)
    expect(second.outputSchema).toEqual(withOutputSchema.outputSchema)
    expect(second.metadata.used_by).toEqual(withOutputSchema.usedBy)
  })

  it("setiap entri registry punya versi 12 heksa yang konsisten dengan getPromptVersion", () => {
    for (const entry of entries) {
      expect(entry.version).toMatch(/^[0-9a-f]{12}$/)
      expect(getPromptVersion(`${entry.name}.md`)).toBe(entry.version)
    }
  })
})

describe("createPromptVersionTracker — versi prompt per run", () => {
  it("mencatat prompt yang dimuat di dalam run, termasuk setelah await, dan mengabaikan yang di luar", async () => {
    const tracker = createPromptVersionTracker()
    loadPrompt("system-guardrail.md")

    const result = await tracker.run(async () => {
      loadPrompt("agent-user-prompt.md")
      await new Promise((resolve) => setTimeout(resolve, 1))
      loadParsedPrompt("system-guardrail")
      return "selesai"
    })

    expect(result).toBe("selesai")
    expect(tracker.versions()).toEqual({
      "agent-user-prompt": getPromptVersion("agent-user-prompt"),
      "system-guardrail": getPromptVersion("system-guardrail"),
    })
    expect(Object.keys(tracker.versions())).toEqual(["agent-user-prompt", "system-guardrail"])
  })

  it("run paralel terisolasi; tracker bersarang juga mencatat ke tracker luar", async () => {
    const outer = createPromptVersionTracker()
    const inner = createPromptVersionTracker()
    const sibling = createPromptVersionTracker()

    await Promise.all([
      outer.run(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        inner.run(() => loadPrompt("system-guardrail.md"))
      }),
      sibling.run(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        loadPrompt("agent-user-prompt.md")
      }),
    ])

    expect(inner.versions()).toEqual({ "system-guardrail": getPromptVersion("system-guardrail") })
    expect(outer.versions()).toEqual({ "system-guardrail": getPromptVersion("system-guardrail") })
    expect(sibling.versions()).toEqual({ "agent-user-prompt": getPromptVersion("agent-user-prompt") })
  })

  it("fallback dicatat dengan versi penanda", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const tracker = createPromptVersionTracker()
    tracker.run(() => loadPrompt("system-tidak-ada.md", "Satu kalimat keselamatan."))
    expect(tracker.versions()).toEqual({ "system-tidak-ada": FALLBACK_PROMPT_VERSION })
  })

  it("nama tidak terdaftar tanpa fallback tidak tercatat", () => {
    const tracker = createPromptVersionTracker()
    expect(() => tracker.run(() => loadSectionedPrompt("system-tidak-ada"))).toThrow()
    expect(tracker.versions()).toEqual({})
  })
})

describe("renderPrompt", () => {
  it("mengganti placeholder (spasi di dalam kurung diizinkan) dan mengosongkan null/undefined", () => {
    expect(renderPrompt("Topik {{keyword}} ({{ language }}) {{brief}}{{note}}", {
      keyword: "kopi",
      language: "Bahasa Indonesia",
      brief: null,
      note: undefined,
    })).toBe("Topik kopi (Bahasa Indonesia)")
  })

  it("membiarkan placeholder tanpa nilai dan menerima angka", () => {
    expect(renderPrompt("{{targetWords}} kata untuk {{keyword}}", { targetWords: 800 })).toBe("800 kata untuk {{keyword}}")
  })

  it("tidak menginterpolasi ulang nilai yang memuat placeholder atau pola $& (satu lintasan)", () => {
    expect(renderPrompt("A: {{brief}} | B: {{keyword}}", { brief: "{{keyword}} $& $1", keyword: "kopi" })).toBe(
      "A: {{keyword}} $& $1 | B: kopi",
    )
  })

  it("merapikan baris kosong berurutan dari variabel opsional yang kosong", () => {
    const template = "Baris 1\n{{opsionalA}}\n\n{{opsionalB}}\n\nBaris 2\n"
    expect(renderPrompt(template, { opsionalA: "", opsionalB: "" })).toBe("Baris 1\n\nBaris 2")
  })
})
