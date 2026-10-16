import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  PROMPTS_DIR,
  buildRegistry,
  compilePrompt,
  inferJsonSchemaFromExample,
  renderRegistryModule,
  validatePromptUsage,
  type RepoView,
} from "./build-prompts"

const FILE = `${PROMPTS_DIR}/system-contoh.md`

function promptFile(parts: { frontmatter?: string; body?: string } = {}): string {
  const frontmatter =
    parts.frontmatter ??
    ["description: Prompt contoh untuk test", "used_by:", "  - src/pemakai.ts", "variables:", "  - key: keyword", "    desc: Topik artikel"].join("\n")
  const body = parts.body ?? "[SYSTEM_PROMPT]\nTulis tentang {{keyword}}.\n[/SYSTEM_PROMPT]"
  return `---\n${frontmatter}\n---\n\n${body}\n`
}

const messages = (raw: string, file = FILE): string[] => compilePrompt(file, raw).issues.map((i) => i.message)

describe("compilePrompt — berkas valid", () => {
  it("menghasilkan section, metadata, dan versi 12 heksa yang stabil", () => {
    const { prompt, issues } = compilePrompt(FILE, promptFile())
    expect(issues).toEqual([])
    expect(prompt).toMatchObject({
      name: "system-contoh",
      file: FILE,
      description: "Prompt contoh untuk test",
      usedBy: ["src/pemakai.ts"],
      variables: [{ key: "keyword", desc: "Topik artikel" }],
      systemPrompt: "Tulis tentang {{keyword}}.",
      userPromptTemplate: "",
    })
    expect(prompt?.version).toMatch(/^[0-9a-f]{12}$/)
    expect(compilePrompt(FILE, promptFile().replace(/\n/g, "\r\n")).prompt?.version).toBe(prompt?.version)
    expect(compilePrompt(FILE, promptFile({ body: "[SYSTEM_PROMPT]\nTulis {{keyword}}!\n[/SYSTEM_PROMPT]" })).prompt?.version).not.toBe(
      prompt?.version,
    )
  })

  it("OUTPUT_FORMAT → schema strict + contoh JSON bersih disisipkan ke USER_PROMPT", () => {
    const body = [
      "[USER_PROMPT]",
      "Analisis {{keyword}}.",
      "[/USER_PROMPT]",
      "",
      "[OUTPUT_FORMAT]",
      '{ "title": "string", "excerpt?": "string", "tags": ["string"] }',
      "[/OUTPUT_FORMAT]",
    ].join("\n")
    const { prompt, issues } = compilePrompt(FILE, promptFile({ body }))
    expect(issues).toEqual([])
    expect(prompt?.outputSchema).toEqual({
      type: "object",
      properties: {
        title: { type: "string" },
        excerpt: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
      required: ["title", "tags"],
    })
    expect(prompt?.userPromptTemplate).toBe(
      'Analisis {{keyword}}.\n\nOutput raw JSON only, exactly in this format:\n{\n  "title": "string",\n  "excerpt": "string",\n  "tags": [\n    "string"\n  ]\n}',
    )
  })

  it("OUTPUT_SCHEMA eksplisit menggantikan hasil infer", () => {
    const body = [
      "[USER_PROMPT]",
      "{{keyword}}",
      "[/USER_PROMPT]",
      "[OUTPUT_FORMAT]",
      '{ "a": "string" }',
      "[/OUTPUT_FORMAT]",
      "[OUTPUT_SCHEMA]",
      '{ "type": "object", "properties": { "b": { "type": "number" } } }',
      "[/OUTPUT_SCHEMA]",
    ].join("\n")
    expect(compilePrompt(FILE, promptFile({ body })).prompt?.outputSchema).toEqual({
      type: "object",
      properties: { b: { type: "number" } },
    })
  })

  it("variables: [] dan tag penutup berindentasi diterima", () => {
    const frontmatter = "description: Tanpa variabel\nused_by:\n  - src/pemakai.ts\nvariables: []"
    const { issues, prompt } = compilePrompt(FILE, promptFile({ frontmatter, body: "[SYSTEM_PROMPT]\nAturan.\n  [/SYSTEM_PROMPT]" }))
    expect(issues).toEqual([])
    expect(prompt?.systemPrompt).toBe("Aturan.")
  })
})

describe("compilePrompt — pelanggaran validasi", () => {
  it("nama berkas tanpa prefix pilar", () => {
    expect(messages(promptFile(), `${PROMPTS_DIR}/contoh.md`)).toContainEqual(expect.stringMatching(/prefix pilar/))
    expect(messages(promptFile(), `${PROMPTS_DIR}/system-Contoh_Baru.md`)).toContainEqual(expect.stringMatching(/prefix pilar/))
  })

  it("frontmatter hilang, tidak ditutup, kunci asing/ganda, atau field wajib kosong", () => {
    expect(messages("[SYSTEM_PROMPT]\nx\n[/SYSTEM_PROMPT]")).toEqual(["frontmatter wajib diawali '---' di baris pertama"])
    expect(messages("---\ndescription: x\n")).toEqual(["frontmatter tidak ditutup dengan '---'"])
    const bad = messages(
      promptFile({ frontmatter: "description: \nused_by: src/a.ts\nversion: 2\nvariables:\n  - key: keyword\nvariables: []" }),
    )
    expect(bad).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/kunci frontmatter tidak dikenal "version"/),
        expect.stringMatching(/"variables" ditulis lebih dari sekali/),
        expect.stringMatching(/"used_by" wajib berupa daftar blok/),
        expect.stringMatching(/description wajib diisi/),
        expect.stringMatching(/used_by wajib berisi minimal satu path/),
        expect.stringMatching(/variabel "keyword" wajib punya desc/),
      ]),
    )
  })

  it("used_by wajib path relatif posix tanpa duplikat", () => {
    const frontmatter = "description: x\nused_by:\n  - /abs/a.ts\n  - src/../b.ts\n  - src/c.ts\n  - src/c.ts\nvariables:\n  - key: keyword\n    desc: Topik"
    expect(messages(promptFile({ frontmatter }))).toEqual([
      'used_by "/abs/a.ts" wajib path relatif dari root repo (posix, tanpa ..)',
      'used_by "src/../b.ts" wajib path relatif dari root repo (posix, tanpa ..)',
      'used_by "src/c.ts" ditulis lebih dari sekali',
    ])
  })

  it("variabel dipakai tanpa deklarasi, dideklarasikan tanpa dipakai, atau placeholder rusak", () => {
    const frontmatter = "description: x\nused_by:\n  - src/a.ts\nvariables:\n  - key: keyword\n    desc: Topik\n  - key: unused\n    desc: Tidak dipakai"
    const body = "[SYSTEM_PROMPT]\n{{keyword}} {{language}} {{ bukan valid }} {{keyword\n[/SYSTEM_PROMPT]"
    const issues = compilePrompt(FILE, promptFile({ frontmatter, body })).issues
    expect(issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        "{{language}} dipakai tetapi tidak dideklarasikan di frontmatter variables",
        'variabel "unused" dideklarasikan tetapi tidak dipakai (tulis {{unused}} di isi atau hapus dari variables)',
        "placeholder {{ bukan valid }} tidak valid (pola {{namaVariabel}})",
        "ada '{{' tanpa penutup '}}' yang valid",
      ]),
    )
    expect(issues.find((i) => i.message.startsWith("{{language}}"))?.line).toBe(13)
  })

  it("section: teks di luar section, tag asing/inline/ganda/bersarang/tidak ditutup/kosong", () => {
    const body = [
      "Teks liar di luar section",
      "[SYSTEM_PROMPT]",
      "{{keyword}} [USER_PROMPT] inline",
      "[CATATAN]",
      "[USER_PROMPT]",
      "[/SYSTEM_PROMPT]",
      "[SYSTEM_PROMPT]",
      "[/SYSTEM_PROMPT]",
      "[/USER_PROMPT]",
      "[OUTPUT_FORMAT]",
      "{ bukan json }",
    ].join("\n")
    expect(messages(promptFile({ body }))).toEqual(
      expect.arrayContaining([
        "teks di luar section [TAG]…[/TAG] akan dibuang; pindahkan ke dalam section",
        "tag section wajib berdiri sendiri di barisnya",
        "tag section tidak dikenal [CATATAN] (yang dikenal: SYSTEM_PROMPT, USER_PROMPT, OUTPUT_FORMAT, OUTPUT_SCHEMA)",
        "[USER_PROMPT] dibuka sebelum [/SYSTEM_PROMPT] (baris 11) ditutup",
        "section [SYSTEM_PROMPT] muncul lebih dari sekali",
        "section [SYSTEM_PROMPT] kosong",
        "[/USER_PROMPT] tanpa pasangan [USER_PROMPT]",
        "section [OUTPUT_FORMAT] tidak ditutup dengan [/OUTPUT_FORMAT]",
      ]),
    )
  })

  it("tanpa SYSTEM_PROMPT/USER_PROMPT, OUTPUT_FORMAT/OUTPUT_SCHEMA bukan JSON valid", () => {
    expect(messages(promptFile({ frontmatter: "description: x\nused_by:\n  - src/a.ts\nvariables: []", body: "[OUTPUT_FORMAT]\n{}\n[/OUTPUT_FORMAT]" }))).toContain(
      "prompt wajib punya section [SYSTEM_PROMPT] atau [USER_PROMPT]",
    )
    const body = "[USER_PROMPT]\n{{keyword}}\n[/USER_PROMPT]\n[OUTPUT_FORMAT]\n{ title: 1 }\n[/OUTPUT_FORMAT]\n[OUTPUT_SCHEMA]\n[1]\n[/OUTPUT_SCHEMA]"
    const found = messages(promptFile({ body }))
    expect(found).toContainEqual(expect.stringMatching(/^\[OUTPUT_FORMAT\] bukan JSON valid/))
    expect(found).toContain("[OUTPUT_SCHEMA] wajib berupa objek JSON Schema")
  })
})

describe("validatePromptUsage — used_by sinkron dengan kode", () => {
  const compiled = [compilePrompt(FILE, promptFile({ frontmatter: "description: x\nused_by:\n  - src/pemakai.ts\n  - src/hilang.ts\n  - src/lain.ts\nvariables:\n  - key: keyword\n    desc: Topik" }))]
  const repo: RepoView = {
    exists: (file) => file !== "src/hilang.ts",
    read: (file) => (file === "src/pemakai.ts" ? 'loadPrompt("system-contoh.md")' : "// tanpa rujukan"),
    sources: [
      { file: "src/pemakai.ts", text: 'loadPrompt("system-contoh.md")' },
      { file: "src/lupa.ts", text: 'const p = loadSectionedPrompt("system-contoh")' },
      { file: "src/typo.ts", text: 'loadPromptFile(\n  "system-tidak-ada.md", "Fallback.")\ngetPromptVersion("agent-x")' },
    ],
  }

  it("melaporkan path hilang, path tanpa rujukan, rujukan tanpa used_by, dan nama prompt yang tidak ada", () => {
    const issues = validatePromptUsage(compiled, new Set(["system-contoh"]), repo)
    expect(issues).toEqual([
      { file: FILE, line: 5, message: 'used_by "src/hilang.ts" tidak ditemukan di repo' },
      { file: FILE, line: 6, message: 'used_by "src/lain.ts" tidak merujuk prompt ini (tidak ada literal "system-contoh.md")' },
      { file: FILE, line: 3, message: "dirujuk oleh src/lupa.ts tetapi berkas itu tidak tercantum di used_by" },
      { file: "src/typo.ts", line: 1, message: `loadPromptFile("system-tidak-ada.md") merujuk prompt yang tidak ada di ${PROMPTS_DIR}/` },
      { file: "src/typo.ts", line: 3, message: `getPromptVersion("agent-x") merujuk prompt yang tidak ada di ${PROMPTS_DIR}/` },
    ])
  })
})

describe("buildRegistry & renderRegistryModule — repo sementara", () => {
  let root = ""
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
    root = ""
  })

  function writeRepoFile(rel: string, content: string): void {
    const abs = path.join(root, rel)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }

  it("membaca *.md, mengabaikan berkas test saat memindai rujukan, dan menghasilkan modul deterministik", () => {
    root = mkdtempSync(path.join(tmpdir(), "panitera-prompts-"))
    writeRepoFile(`${PROMPTS_DIR}/system-contoh.md`, promptFile())
    writeRepoFile(`${PROMPTS_DIR}/agent-a.md`, promptFile({ frontmatter: "description: A\nused_by:\n  - src/pemakai.ts\nvariables: []", body: "[USER_PROMPT]\nHalo.\n[/USER_PROMPT]" }))
    writeRepoFile("src/pemakai.ts", 'loadPrompt("system-contoh.md")\nloadPrompt("agent-a")\n')
    writeRepoFile("src/pemakai.test.ts", 'loadPrompt("system-tidak-ada.md")\n')

    const { prompts, issues } = buildRegistry(root)
    expect(issues).toEqual([])
    expect(prompts.map((p) => p.name)).toEqual(["agent-a", "system-contoh"])

    const source = renderRegistryModule([...prompts].reverse())
    expect(source).toBe(renderRegistryModule(prompts))
    expect(source).toContain("export const PROMPT_REGISTRY: Readonly<Record<string, PromptRegistryEntry>> = {")
    expect(source.indexOf('"agent-a"')).toBeLessThan(source.indexOf('"system-contoh"'))
  })
})

describe("inferJsonSchemaFromExample", () => {
  it("menangani primitif, null, array kosong, dan objek bersarang opsional", () => {
    expect(inferJsonSchemaFromExample(null)).toEqual({ type: ["string", "null"] })
    expect(inferJsonSchemaFromExample(1.5)).toEqual({ type: "number" })
    expect(inferJsonSchemaFromExample(2)).toEqual({ type: "integer" })
    expect(inferJsonSchemaFromExample([])).toEqual({ type: "array", items: { type: "string" } })
    expect(inferJsonSchemaFromExample({ "meta?": { ok: true } })).toEqual({
      type: "object",
      properties: {
        meta: { type: ["object", "null"], properties: { ok: { type: "boolean" } }, additionalProperties: false, required: ["ok"] },
      },
      additionalProperties: false,
    })
  })
})
