import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { REGISTRY_FILE, buildRegistry, renderRegistryModule } from "../../../../scripts/build-prompts"

const ROOT = path.resolve(import.meta.dirname, "../../../..")

describe("registry prompt (registry.generated.ts)", () => {
  const { prompts, issues } = buildRegistry(ROOT)

  it("seluruh berkas .md lolos validasi build-prompts", () => {
    const report = issues.map((i) => `${i.file}:${i.line} — ${i.message}`).join("\n")
    expect(issues, `Validasi prompt gagal:\n${report}`).toEqual([])
  })

  it("sinkron dengan berkas .md (jalankan `npm run prompts:build` bila gagal)", () => {
    const committed = readFileSync(path.join(ROOT, REGISTRY_FILE), "utf-8")
    expect(
      committed === renderRegistryModule(prompts),
      `${REGISTRY_FILE} basi terhadap src/core/shared/prompts/*.md — jalankan \`npm run prompts:build\` lalu commit hasilnya.`,
    ).toBe(true)
  })
})
