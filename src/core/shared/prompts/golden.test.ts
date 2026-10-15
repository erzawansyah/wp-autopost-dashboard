import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { loadSectionedPrompt, renderPrompt } from "./loader"
import { PROMPT_REGISTRY } from "./registry.generated"

/**
 * Eval deterministik prompt: setiap prompt di registry dirender dengan nilai contoh tetap
 * (`__golden__/sample-variables.json`) lalu dibandingkan dengan `__golden__/<nama>.golden.txt`, sehingga
 * setiap perubahan prompt (isi .md, kompilasi OUTPUT_FORMAT, atau renderPrompt) muncul sebagai diff
 * yang dapat ditinjau di PR. Tulis ulang golden: `UPDATE_GOLDEN=1 npx vitest run src/core/shared/prompts/golden.test.ts`.
 */

const GOLDEN_DIR = path.join(import.meta.dirname, "__golden__")
const GOLDEN_SUFFIX = ".golden.txt"
const UPDATE = process.env.UPDATE_GOLDEN === "1"
const UPDATE_HINT = "UPDATE_GOLDEN=1 npx vitest run src/core/shared/prompts/golden.test.ts"

interface SampleVariables {
  default: Record<string, string>
  byPrompt: Record<string, Record<string, string>>
}

const samples = JSON.parse(readFileSync(path.join(GOLDEN_DIR, "sample-variables.json"), "utf-8")) as SampleVariables
const promptNames = Object.keys(PROMPT_REGISTRY).sort()

function sampleValue(promptName: string, key: string): string {
  return samples.byPrompt[promptName]?.[key] ?? samples.default[key] ?? `‹${key}›`
}

function renderGolden(name: string): string {
  const prompt = loadSectionedPrompt(name)
  const variables = Object.fromEntries((prompt.metadata?.variables ?? []).map((v) => [v.key, sampleValue(name, v.key)]))
  const parts = [
    `# GOLDEN prompt "${name}" · versi ${prompt.version}`,
    `# Dibuat golden.test.ts dengan __golden__/sample-variables.json — jangan diedit manual (${UPDATE_HINT}).`,
  ]
  if (prompt.systemPrompt) parts.push("", "===== [SYSTEM_PROMPT] dirender =====", renderPrompt(prompt.systemPrompt, variables))
  if (prompt.userPromptTemplate) parts.push("", "===== [USER_PROMPT] dirender =====", renderPrompt(prompt.userPromptTemplate, variables))
  if (prompt.outputSchema) parts.push("", "===== [OUTPUT_SCHEMA] =====", JSON.stringify(prompt.outputSchema, null, 2))
  return `${parts.join("\n")}\n`
}

describe("golden prompt terender (eval deterministik perubahan prompt)", () => {
  it.each(promptNames)("%s cocok dengan golden", (name) => {
    const actual = renderGolden(name)
    expect(actual, "masih ada placeholder {{…}} yang tidak terisi").not.toMatch(/\{\{\s*[A-Za-z_]\w*\s*\}\}/)

    const file = path.join(GOLDEN_DIR, `${name}${GOLDEN_SUFFIX}`)
    if (UPDATE) {
      writeFileSync(file, actual)
      return
    }
    expect(existsSync(file), `Golden ${name} belum ada — jalankan ${UPDATE_HINT}`).toBe(true)
    expect(actual, `Prompt ${name} berubah — tinjau diff, lalu ${UPDATE_HINT}`).toBe(readFileSync(file, "utf-8"))
  })

  it("tidak ada golden yatim untuk prompt yang sudah dihapus", () => {
    const orphans = readdirSync(GOLDEN_DIR)
      .filter((f) => f.endsWith(GOLDEN_SUFFIX))
      .filter((f) => !promptNames.includes(f.slice(0, -GOLDEN_SUFFIX.length)))
    if (UPDATE) {
      for (const f of orphans) rmSync(path.join(GOLDEN_DIR, f))
      return
    }
    expect(orphans, `Golden yatim — jalankan ${UPDATE_HINT}`).toEqual([])
  })

  it("setiap nilai contoh di sample-variables.json dipakai oleh prompt yang ada", () => {
    const declared = new Map(promptNames.map((n) => [n, new Set(PROMPT_REGISTRY[n].variables.map((v) => v.key))]))
    const allKeys = new Set([...declared.values()].flatMap((keys) => [...keys]))
    const unusedDefaults = Object.keys(samples.default).filter((k) => !allKeys.has(k))
    const unusedOverrides = Object.entries(samples.byPrompt).flatMap(([name, vars]) =>
      Object.keys(vars)
        .filter((k) => !declared.get(name)?.has(k))
        .map((k) => `${name}.${k}`),
    )
    expect([...unusedDefaults, ...unusedOverrides]).toEqual([])
  })
})
