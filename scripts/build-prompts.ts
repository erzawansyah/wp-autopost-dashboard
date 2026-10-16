/**
 * @file scripts/build-prompts.ts
 * @description Kompiler registry prompt Panitera. Membaca seluruh `src/core/shared/prompts/*.md`,
 * memvalidasinya, lalu menulis modul ter-generate `src/core/shared/prompts/registry.generated.ts`
 * (di-commit) yang dibundel Next.js — runtime tidak membaca disk (lihat `loader.ts`).
 *
 * Aturan validasi (sumber tunggal; dipakai juga oleh cek `prompt-file` di `npm run audit:hygiene`):
 * 1. Nama berkas berprefix pilar `wp-tools-*`, `system-*`, atau `agent-*` (kebab-case, `.md`).
 * 2. Frontmatter subset YAML mulai baris pertama dengan tepat tiga kunci:
 *    - `description`: satu baris, wajib, tidak kosong;
 *    - `used_by`    : daftar blok (`- path`), wajib, minimal satu path relatif dari root repo;
 *    - `variables`  : daftar blok (`- key: nama` + `desc: ...`) atau `[]`; setiap variabel wajib punya `desc`.
 * 3. Setiap path `used_by` ada di repo DAN memuat literal nama prompt (mis. `"system-guardrail.md"`);
 *    sebaliknya setiap berkas kode non-test di `src/` yang merujuk nama prompt wajib tercantum di `used_by`.
 * 4. Variabel: setiap `{{var}}` di isi wajib dideklarasikan, dan setiap variabel yang dideklarasikan wajib
 *    muncul di isi. Variabel opsional/kondisional (nilainya bisa kosong) TETAP ditulis sebagai `{{var}}`;
 *    pemanggil mengisi string kosong dan `renderPrompt` merapikan baris kosong ganda. Variabel yang disediakan
 *    pemanggil tetapi tidak dipakai template TIDAK dideklarasikan (frontmatter = kontrak template itu sendiri).
 * 5. Section `[SYSTEM_PROMPT]`, `[USER_PROMPT]`, `[OUTPUT_FORMAT]`, `[OUTPUT_SCHEMA]`: tag berdiri sendiri di
 *    barisnya, tiap section paling banyak sekali, tidak bersarang, ditutup `[/TAG]`, tidak kosong; minimal ada
 *    SYSTEM_PROMPT atau USER_PROMPT; tidak ada teks di luar section (teks itu dulu diam-diam dibuang).
 * 6. `[OUTPUT_FORMAT]` wajib JSON valid (key berakhiran `?` = opsional/nullable; JSON Schema strict diinfer
 *    otomatis dan contoh bersihnya disisipkan ke akhir USER_PROMPT). `[OUTPUT_SCHEMA]` (opsional) wajib objek
 *    JSON valid dan menggantikan schema hasil infer.
 * 7. Pemanggilan `load*Prompt*("…")` / `getPromptVersion("…")` dengan literal nama di `src/` wajib merujuk
 *    prompt yang ada.
 *
 * Versi prompt = 12 heksa pertama sha256 atas isi yang dikirim ke LLM (body + section terkompilasi + schema).
 * Loader mengekspos versi ini (`getPromptVersion`, `createPromptVersionTracker`) untuk dicatat per run.
 *
 * @prerequisites
 * - Node.js 22.18+ (type stripping bawaan; skrip hanya memakai sintaks TS yang dapat dihapus dan modul node:*).
 * - Tidak membutuhkan variabel .env.
 *
 * @usage
 * npm run prompts:build              # validasi + tulis ulang registry bila berubah (juga otomatis saat prebuild)
 * npm run prompts:build -- --check   # validasi + gagal bila registry basi, tanpa menulis berkas
 *
 * @output
 * - exit 0: registry mutakhir/ditulis ulang; exit 1: pelanggaran validasi atau registry basi (--check).
 */
import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const PROMPTS_DIR = "src/core/shared/prompts"
export const REGISTRY_FILE = `${PROMPTS_DIR}/registry.generated.ts`

const PROMPT_FILE_NAME = /^(?:wp-tools|system|agent)-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const VARIABLE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
const FRONTMATTER_KEYS = new Set(["description", "used_by", "variables"])
const SECTION_TAGS = ["SYSTEM_PROMPT", "USER_PROMPT", "OUTPUT_FORMAT", "OUTPUT_SCHEMA"] as const
type SectionTag = (typeof SECTION_TAGS)[number]
const TAG_LINE = /^\s*\[(\/?)([A-Z][A-Z0-9_]*)\]\s*$/
const INLINE_TAG = new RegExp(`\\[\\/?(?:${SECTION_TAGS.join("|")})\\]`)
/** Kalimat format JSON yang disisipkan ke USER_PROMPT bila prompt punya [OUTPUT_FORMAT] (perilaku loader lama). */
const JSON_INSTRUCTION = "Output raw JSON only, exactly in this format:"
const JSON_INSTRUCTION_MARKERS = ["Output raw JSON", "JSON format"]
const VERSION_LENGTH = 12
const SOURCE_EXT = /\.tsx?$/
const TEST_FILE = /\.(?:test|spec)\.tsx?$/
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"])
/** Pemanggilan loader dengan literal nama prompt (termasuk pembungkus seperti `loadPromptFile`). */
const PROMPT_CALL = /\b(load\w*Prompt\w*|getPromptVersion)\(\s*(["'`])([^"'`\n]+)\2/g

export interface PromptIssue {
  /** Path relatif dari root repo (posix). */
  file: string
  line: number
  message: string
}

export interface PromptVariable {
  key: string
  desc: string
}

export interface CompiledPrompt {
  name: string
  file: string
  version: string
  description: string
  usedBy: string[]
  variables: PromptVariable[]
  body: string
  systemPrompt: string
  userPromptTemplate: string
  outputFormat?: string
  outputSchema?: Record<string, unknown>
}

/** Deklarasi `used_by` satu prompt; tetap tersedia walau isi prompt bermasalah agar rujukan ikut divalidasi. */
export interface PromptUsage {
  name: string
  file: string
  usedBy: { value: string; line: number }[]
  usedByLine: number
}

export interface CompileResult {
  /** Null bila ada masalah validasi. */
  prompt: CompiledPrompt | null
  /** Null bila frontmatter tidak dapat dibaca. */
  usage: PromptUsage | null
  issues: PromptIssue[]
}

export interface SourceFile {
  file: string
  text: string
}

/** Tampilan repo yang dibutuhkan validasi rujukan; dapat dipalsukan di test. */
export interface RepoView {
  exists(file: string): boolean
  read(file: string): string
  /** Berkas kode non-test di `src/` (di luar folder prompt). */
  sources: SourceFile[]
}

export interface RegistryBuild {
  prompts: CompiledPrompt[]
  issues: PromptIssue[]
}

interface Frontmatter {
  description: string
  usedBy: { value: string; line: number }[]
  usedByLine: number
  variables: { key: string; desc: string; line: number }[]
}

interface Section {
  content: string
  line: number
}

// ---------------------------------------------------------------------------
// Utilitas
// ---------------------------------------------------------------------------

function unquote(value: string): string {
  const s = value.trim()
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1).trim()
  }
  return s
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const lineOfOffset = (text: string, offset: number): number => text.slice(0, offset).split("\n").length
const isSectionTag = (name: string): name is SectionTag => (SECTION_TAGS as readonly string[]).includes(name)
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Referensi kode ke prompt: literal `"nama"` / `"nama.md"` (juga diawali `/`), sama dengan audit lama. */
const promptReference = (name: string): RegExp => new RegExp(`["'\`/]${escapeRegExp(name)}(?:\\.md)?["'\`]`)

// ---------------------------------------------------------------------------
// [OUTPUT_FORMAT] → JSON Schema (dipindah dari loader runtime)
// ---------------------------------------------------------------------------

/**
 * Menghasilkan JSON Schema strict dari contoh JSON. Kunci berakhiran `?` dianggap opsional: tidak masuk
 * `required` dan tipenya mengizinkan `null`.
 */
export function inferJsonSchemaFromExample(example: unknown): Record<string, unknown> {
  if (example === null || example === undefined) return { type: ["string", "null"] }
  if (typeof example === "string") return { type: "string" }
  if (typeof example === "number") return Number.isInteger(example) ? { type: "integer" } : { type: "number" }
  if (typeof example === "boolean") return { type: "boolean" }
  if (Array.isArray(example)) {
    return { type: "array", items: example.length > 0 ? inferJsonSchemaFromExample(example[0]) : { type: "string" } }
  }
  if (isPlainObject(example)) {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [rawKey, rawVal] of Object.entries(example)) {
      const isOptional = rawKey.endsWith("?")
      const cleanKey = isOptional ? rawKey.slice(0, -1).trim() : rawKey.trim()
      const childSchema = inferJsonSchemaFromExample(rawVal)
      if (isOptional) {
        if (typeof childSchema.type === "string") {
          childSchema.type = [childSchema.type, "null"]
        } else if (Array.isArray(childSchema.type) && !childSchema.type.includes("null")) {
          childSchema.type.push("null")
        }
      } else {
        required.push(cleanKey)
      }
      properties[cleanKey] = childSchema
    }
    const schema: Record<string, unknown> = { type: "object", properties, additionalProperties: false }
    if (required.length > 0) schema.required = required
    return schema
  }
  return { type: "string" }
}

/** Menghapus akhiran `?` dari kunci objek agar contoh JSON yang disisipkan ke prompt bersih. */
function cleanExampleForPrompt(example: unknown): unknown {
  if (Array.isArray(example)) return example.map(cleanExampleForPrompt)
  if (isPlainObject(example)) {
    const cleaned: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(example)) {
      cleaned[key.endsWith("?") ? key.slice(0, -1).trim() : key.trim()] = cleanExampleForPrompt(val)
    }
    return cleaned
  }
  return example
}

// ---------------------------------------------------------------------------
// Parser frontmatter & section
// ---------------------------------------------------------------------------

function parseFrontmatter(
  lines: string[],
  report: (line: number, message: string) => void,
): { frontmatter: Frontmatter; bodyStart: number } | null {
  if (lines[0]?.trim() !== "---") {
    report(1, "frontmatter wajib diawali '---' di baris pertama")
    return null
  }
  const end = lines.findIndex((line, idx) => idx > 0 && line.trim() === "---")
  if (end === -1) {
    report(1, "frontmatter tidak ditutup dengan '---'")
    return null
  }

  const fm: Frontmatter = { description: "", usedBy: [], usedByLine: 1, variables: [] }
  const seen = new Map<string, number>()
  let list: "used_by" | "variables" | null = null

  for (let idx = 1; idx < end; idx++) {
    const lineNo = idx + 1
    const line = lines[idx]
    if (!line.trim() || line.trim().startsWith("#")) continue

    const top = /^([A-Za-z_][\w-]*):(.*)$/.exec(line)
    if (top) {
      const key = top[1]
      const value = top[2].trim()
      list = null
      if (!FRONTMATTER_KEYS.has(key)) {
        report(lineNo, `kunci frontmatter tidak dikenal "${key}" (hanya description, used_by, variables)`)
        continue
      }
      if (seen.has(key)) {
        report(lineNo, `kunci frontmatter "${key}" ditulis lebih dari sekali`)
        continue
      }
      seen.set(key, lineNo)
      if (key === "description") {
        fm.description = unquote(value)
      } else {
        if (key === "used_by") fm.usedByLine = lineNo
        if (value === "") list = key === "used_by" ? "used_by" : "variables"
        else if (value !== "[]") report(lineNo, `"${key}" wajib berupa daftar blok (baris "- …") atau []`)
      }
      continue
    }

    if (list === "used_by") {
      const item = /^\s+-\s+(.+)$/.exec(line)
      if (item) {
        fm.usedBy.push({ value: unquote(item[1]), line: lineNo })
        continue
      }
    } else if (list === "variables") {
      const keyItem = /^\s+-\s+key:\s*(.*)$/.exec(line)
      if (keyItem) {
        fm.variables.push({ key: unquote(keyItem[1]), desc: "", line: lineNo })
        continue
      }
      const descItem = /^\s+desc:\s*(.*)$/.exec(line)
      const last = fm.variables.at(-1)
      if (descItem && last) {
        if (last.desc) report(lineNo, `variabel "${last.key}" punya lebih dari satu desc`)
        last.desc = unquote(descItem[1])
        continue
      }
    }
    report(lineNo, `baris frontmatter tidak dikenali: "${line.trim()}"`)
  }

  if (!fm.description) report(seen.get("description") ?? 1, "description wajib diisi (satu kalimat fungsi prompt)")
  if (!seen.has("used_by") || fm.usedBy.length === 0) {
    report(seen.get("used_by") ?? 1, "used_by wajib berisi minimal satu path berkas pemakai")
  }
  if (!seen.has("variables")) report(1, "variables wajib ada (tulis `variables: []` bila prompt tanpa variabel)")

  const keys = new Set<string>()
  for (const v of fm.variables) {
    if (!VARIABLE_KEY.test(v.key)) report(v.line, `nama variabel "${v.key}" tidak valid (pola [A-Za-z_][A-Za-z0-9_]*)`)
    if (keys.has(v.key)) report(v.line, `variabel "${v.key}" dideklarasikan lebih dari sekali`)
    keys.add(v.key)
    if (!v.desc) report(v.line, `variabel "${v.key}" wajib punya desc`)
  }
  const paths = new Set<string>()
  for (const u of fm.usedBy) {
    if (u.value.startsWith("/") || u.value.includes("\\") || u.value.split("/").includes("..")) {
      report(u.line, `used_by "${u.value}" wajib path relatif dari root repo (posix, tanpa ..)`)
    }
    if (paths.has(u.value)) report(u.line, `used_by "${u.value}" ditulis lebih dari sekali`)
    paths.add(u.value)
  }

  return { frontmatter: fm, bodyStart: end + 1 }
}

function parseSections(
  lines: string[],
  bodyStart: number,
  report: (line: number, message: string) => void,
): Partial<Record<SectionTag, Section>> {
  const sections: Partial<Record<SectionTag, Section>> = {}
  let open: { tag: SectionTag; line: number; start: number } | null = null
  let inStrayRun = false

  for (let idx = bodyStart; idx < lines.length; idx++) {
    const lineNo = idx + 1
    const line = lines[idx]
    const tag = TAG_LINE.exec(line)

    if (!tag) {
      if (INLINE_TAG.test(line)) report(lineNo, "tag section wajib berdiri sendiri di barisnya")
      const stray = open === null && line.trim() !== ""
      if (stray && !inStrayRun) report(lineNo, "teks di luar section [TAG]…[/TAG] akan dibuang; pindahkan ke dalam section")
      inStrayRun = stray
      continue
    }
    inStrayRun = false

    const closing = tag[1] === "/"
    const name = tag[2]
    if (!isSectionTag(name)) {
      report(lineNo, `tag section tidak dikenal [${tag[1]}${name}] (yang dikenal: ${SECTION_TAGS.join(", ")})`)
      continue
    }
    if (!closing) {
      if (open) {
        report(lineNo, `[${name}] dibuka sebelum [/${open.tag}] (baris ${open.line}) ditutup`)
        continue
      }
      if (sections[name]) report(lineNo, `section [${name}] muncul lebih dari sekali`)
      open = { tag: name, line: lineNo, start: idx + 1 }
      continue
    }
    if (!open || open.tag !== name) {
      report(lineNo, `[/${name}] tanpa pasangan [${name}]`)
      continue
    }
    const content = lines.slice(open.start, idx).join("\n").trim()
    if (!content) report(open.line, `section [${name}] kosong`)
    sections[name] ??= { content, line: open.line }
    open = null
  }

  if (open) report(open.line, `section [${open.tag}] tidak ditutup dengan [/${open.tag}]`)
  if (!sections.SYSTEM_PROMPT && !sections.USER_PROMPT) {
    report(bodyStart + 1, "prompt wajib punya section [SYSTEM_PROMPT] atau [USER_PROMPT]")
  }
  return sections
}

function checkVariables(
  bodyText: string,
  bodyFirstLine: number,
  declared: Frontmatter["variables"],
  report: (line: number, message: string) => void,
): void {
  const used = new Map<string, number>()
  for (const m of bodyText.matchAll(/\{\{([^{}]*)\}\}/g)) {
    const line = bodyFirstLine + lineOfOffset(bodyText, m.index) - 1
    const key = m[1].trim()
    if (!VARIABLE_KEY.test(key)) {
      report(line, `placeholder {{${m[1]}}} tidak valid (pola {{namaVariabel}})`)
      continue
    }
    if (!used.has(key)) used.set(key, line)
  }
  const unclosed = bodyText.replace(/\{\{[^{}]*\}\}/g, "").indexOf("{{")
  if (unclosed !== -1) report(bodyFirstLine, "ada '{{' tanpa penutup '}}' yang valid")

  const declaredKeys = new Set(declared.map((v) => v.key))
  for (const [key, line] of used) {
    if (!declaredKeys.has(key)) report(line, `{{${key}}} dipakai tetapi tidak dideklarasikan di frontmatter variables`)
  }
  for (const v of declared) {
    if (VARIABLE_KEY.test(v.key) && !used.has(v.key)) {
      report(v.line, `variabel "${v.key}" dideklarasikan tetapi tidak dipakai (tulis {{${v.key}}} di isi atau hapus dari variables)`)
    }
  }
}

// ---------------------------------------------------------------------------
// Kompilasi satu berkas prompt
// ---------------------------------------------------------------------------

/** Mem-parse & memvalidasi satu berkas prompt (tanpa akses repo); `prompt` null bila ada masalah. */
export function compilePrompt(file: string, raw: string): CompileResult {
  const issues: PromptIssue[] = []
  const report = (line: number, message: string): void => {
    issues.push({ file, line, message })
  }
  const baseName = path.posix.basename(file)
  if (!PROMPT_FILE_NAME.test(baseName)) {
    report(1, "nama berkas wajib berprefix pilar wp-tools-*, system-*, atau agent-* (kebab-case .md)")
  }

  const name = baseName.replace(/\.md$/, "")
  const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n")
  const parsed = parseFrontmatter(lines, report)
  if (!parsed) return { prompt: null, usage: null, issues }
  const { frontmatter, bodyStart } = parsed
  const usage: PromptUsage = { name, file, usedBy: frontmatter.usedBy, usedByLine: frontmatter.usedByLine }

  const bodyText = lines.slice(bodyStart).join("\n")
  const sections = parseSections(lines, bodyStart, report)
  checkVariables(bodyText, bodyStart + 1, frontmatter.variables, report)

  const systemPrompt = sections.SYSTEM_PROMPT?.content ?? ""
  let userPromptTemplate = sections.USER_PROMPT?.content ?? ""
  let outputSchema: Record<string, unknown> | undefined

  if (sections.OUTPUT_SCHEMA) {
    const schema = parseJson(sections.OUTPUT_SCHEMA.content)
    if (!schema.ok) report(sections.OUTPUT_SCHEMA.line, `[OUTPUT_SCHEMA] bukan JSON valid: ${schema.error}`)
    else if (!isPlainObject(schema.value)) report(sections.OUTPUT_SCHEMA.line, "[OUTPUT_SCHEMA] wajib berupa objek JSON Schema")
    else outputSchema = schema.value
  }

  const outputFormat = sections.OUTPUT_FORMAT?.content
  if (sections.OUTPUT_FORMAT && outputFormat !== undefined) {
    const example = parseJson(outputFormat)
    if (!example.ok) {
      report(sections.OUTPUT_FORMAT.line, `[OUTPUT_FORMAT] bukan JSON valid: ${example.error}`)
    } else {
      outputSchema ??= inferJsonSchemaFromExample(example.value)
      if (!JSON_INSTRUCTION_MARKERS.some((marker) => userPromptTemplate.includes(marker))) {
        const cleanExample = JSON.stringify(cleanExampleForPrompt(example.value), null, 2)
        userPromptTemplate = `${userPromptTemplate}\n\n${JSON_INSTRUCTION}\n${cleanExample}`.trim()
      }
    }
  }

  if (issues.length > 0) return { prompt: null, usage, issues }

  const body = bodyText.trim()
  const version = createHash("sha256")
    .update(JSON.stringify([body, systemPrompt, userPromptTemplate, outputSchema ?? null]))
    .digest("hex")
    .slice(0, VERSION_LENGTH)

  return {
    prompt: {
      name,
      file,
      version,
      description: frontmatter.description,
      usedBy: frontmatter.usedBy.map((u) => u.value),
      variables: frontmatter.variables.map(({ key, desc }) => ({ key, desc })),
      body,
      systemPrompt,
      userPromptTemplate,
      outputFormat,
      outputSchema,
    },
    usage,
    issues,
  }
}

// ---------------------------------------------------------------------------
// Validasi rujukan lintas repo (used_by ↔ kode pemakai)
// ---------------------------------------------------------------------------

/**
 * `used_by` harus sinkron dengan kode: tiap path ada & merujuk prompt, tiap rujukan kode tercantum,
 * dan tiap literal nama di pemanggilan loader menunjuk prompt yang ada (`knownNames`).
 */
export function validatePromptUsage(
  compiled: readonly CompileResult[],
  knownNames: ReadonlySet<string>,
  repo: RepoView,
): PromptIssue[] {
  const issues: PromptIssue[] = []

  for (const { usage } of compiled) {
    if (!usage) continue
    const reference = promptReference(usage.name)
    for (const { value, line } of usage.usedBy) {
      if (!repo.exists(value)) {
        issues.push({ file: usage.file, line, message: `used_by "${value}" tidak ditemukan di repo` })
      } else if (!reference.test(repo.read(value))) {
        issues.push({
          file: usage.file,
          line,
          message: `used_by "${value}" tidak merujuk prompt ini (tidak ada literal "${usage.name}.md")`,
        })
      }
    }
    for (const source of repo.sources) {
      if (reference.test(source.text) && !usage.usedBy.some((u) => u.value === source.file)) {
        issues.push({
          file: usage.file,
          line: usage.usedByLine,
          message: `dirujuk oleh ${source.file} tetapi berkas itu tidak tercantum di used_by`,
        })
      }
    }
  }

  for (const source of repo.sources) {
    for (const m of source.text.matchAll(PROMPT_CALL)) {
      const name = m[3].trim().replace(/\.md$/, "")
      if (!knownNames.has(name)) {
        issues.push({
          file: source.file,
          line: lineOfOffset(source.text, m.index),
          message: `${m[1]}("${m[3]}") merujuk prompt yang tidak ada di ${PROMPTS_DIR}/`,
        })
      }
    }
  }
  return issues
}

function walkSources(root: string, dirRel: string, out: SourceFile[]): SourceFile[] {
  const dirAbs = path.join(root, dirRel)
  if (!existsSync(dirAbs)) return out
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    const rel = `${dirRel}/${entry.name}`
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && rel !== PROMPTS_DIR && rel !== "src/test-utils") walkSources(root, rel, out)
    } else if (entry.isFile() && SOURCE_EXT.test(entry.name) && !TEST_FILE.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push({ file: rel, text: readFileSync(path.join(dirAbs, entry.name), "utf-8") })
    }
  }
  return out
}

function createRepoView(root: string): RepoView {
  return {
    exists: (file) => existsSync(path.join(root, file)),
    read: (file) => readFileSync(path.join(root, file), "utf-8"),
    sources: walkSources(root, "src", []),
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Membaca, mengompilasi, dan memvalidasi seluruh prompt di repo `root`. */
export function buildRegistry(root: string): RegistryBuild {
  const dirAbs = path.join(root, PROMPTS_DIR)
  const names = readdirSync(dirAbs).filter((f) => f.endsWith(".md")).sort()
  const compiled = names.map((name) => compilePrompt(`${PROMPTS_DIR}/${name}`, readFileSync(path.join(dirAbs, name), "utf-8")))
  const knownNames = new Set(names.map((name) => name.replace(/\.md$/, "")))
  const issues = [...compiled.flatMap((c) => c.issues), ...validatePromptUsage(compiled, knownNames, createRepoView(root))]
  const prompts = compiled.flatMap((c) => (c.prompt ? [c.prompt] : []))
  return { prompts, issues }
}

const REGISTRY_PREAMBLE = `/**
 * BERKAS TER-GENERATE — JANGAN DIEDIT MANUAL.
 * Sumber: ${PROMPTS_DIR}/*.md · generator: scripts/build-prompts.ts (\`npm run prompts:build\`).
 * \`registry.test.ts\` gagal bila berkas ini tidak sinkron dengan berkas .md.
 */

export interface PromptRegistryVariable {
  readonly key: string
  readonly desc: string
}

export interface PromptRegistryEntry {
  /** Nama tanpa ekstensi, mis. \`system-guardrail\`. */
  readonly name: string
  /** Path berkas sumber relatif dari root repo. */
  readonly file: string
  /** 12 heksa pertama sha256 isi yang dikirim ke LLM; dicatat per run (agent_runs). */
  readonly version: string
  readonly description: string
  readonly usedBy: readonly string[]
  readonly variables: readonly PromptRegistryVariable[]
  /** Isi mentah setelah frontmatter (termasuk tag section). */
  readonly body: string
  readonly systemPrompt: string
  /** USER_PROMPT; bila ada [OUTPUT_FORMAT], contoh JSON bersihnya sudah disisipkan di akhir. */
  readonly userPromptTemplate: string
  readonly outputFormat?: string
  readonly outputSchema?: Readonly<Record<string, unknown>>
}
`

/** Sumber modul registry (deterministik: urut nama, urutan kunci tetap). */
export function renderRegistryModule(prompts: readonly CompiledPrompt[]): string {
  const sorted = [...prompts].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const entries: Record<string, CompiledPrompt> = {}
  for (const p of sorted) {
    entries[p.name] = {
      name: p.name,
      file: p.file,
      version: p.version,
      description: p.description,
      usedBy: p.usedBy,
      variables: p.variables,
      body: p.body,
      systemPrompt: p.systemPrompt,
      userPromptTemplate: p.userPromptTemplate,
      outputFormat: p.outputFormat,
      outputSchema: p.outputSchema,
    }
  }
  return `${REGISTRY_PREAMBLE}
export const PROMPT_REGISTRY: Readonly<Record<string, PromptRegistryEntry>> = ${JSON.stringify(entries, null, 2)}
`
}

const byLocation = (a: PromptIssue, b: PromptIssue): number =>
  (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line

function main(): void {
  const check = process.argv.slice(2).includes("--check")
  const root = path.resolve(import.meta.dirname, "..")
  const { prompts, issues } = buildRegistry(root)

  if (issues.length > 0) {
    console.error(`✗ Validasi prompt gagal (${issues.length} masalah) — registry tidak ditulis:`)
    for (const issue of [...issues].sort(byLocation)) console.error(`   ${issue.file}:${issue.line} — ${issue.message}`)
    console.error("Aturan: header scripts/build-prompts.ts & .claude/rules/prompt-management.md.")
    process.exitCode = 1
    return
  }

  const source = renderRegistryModule(prompts)
  const target = path.join(root, REGISTRY_FILE)
  const current = existsSync(target) ? readFileSync(target, "utf-8") : null
  if (current === source) {
    console.log(`✓ ${REGISTRY_FILE} mutakhir (${prompts.length} prompt).`)
    return
  }
  if (check) {
    console.error(`✗ ${REGISTRY_FILE} basi — jalankan \`npm run prompts:build\` lalu commit hasilnya.`)
    process.exitCode = 1
    return
  }
  writeFileSync(target, source)
  console.log(`✓ ${REGISTRY_FILE} ditulis ulang (${prompts.length} prompt):`)
  for (const p of prompts) console.log(`   ${p.name}@${p.version}`)
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
