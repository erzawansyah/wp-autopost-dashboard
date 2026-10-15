import { AsyncLocalStorage } from "node:async_hooks"
import { PROMPT_REGISTRY, type PromptRegistryEntry } from "./registry.generated"

/**
 * Utilitas Pemuatan & Interpolasi Prompt Panitera
 *
 * Sumber prompt adalah berkas `.md` di folder ini (format: `.claude/rules/prompt-management.md`):
 * frontmatter (`description`, `used_by`, `variables`) + section `[SYSTEM_PROMPT]`, `[USER_PROMPT]`,
 * `[OUTPUT_FORMAT]` (contoh JSON, key berakhiran `?` = opsional/nullable), `[OUTPUT_SCHEMA]` (opsional).
 * Berkas dikompilasi & divalidasi oleh `scripts/build-prompts.ts` menjadi `registry.generated.ts` yang
 * dibundel Next.js, sehingga runtime tidak membaca disk. Setelah mengubah/menambah berkas `.md`, jalankan
 * `npm run prompts:build` (otomatis juga sebelum `npm run build`); `registry.test.ts` gagal bila lupa.
 *
 * Nama prompt ditulis persis, dengan atau tanpa `.md` (`"system-guardrail.md"` ≡ `"system-guardrail"`).
 * Nama yang tidak terdaftar melempar error — kecuali `loadPrompt(file, fallback)` dengan fallback satu
 * kalimat keselamatan.
 *
 * Versi prompt (`version`: 12 heksa sha256 isi yang dikirim ke LLM) tersedia lewat `getPromptVersion()` dan
 * field `version` hasil `loadSectionedPrompt`/`loadParsedPrompt`. Untuk mencatat seluruh prompt yang dimuat
 * sebuah run (mis. ke `agent_runs`), bungkus run dengan `createPromptVersionTracker().run(...)`.
 */

export interface PromptVariableMeta {
  key: string
  desc: string
}

export interface PromptMetadata {
  description?: string
  used_by?: string[]
  usedBy?: string[]
  variables?: PromptVariableMeta[]
  [key: string]: unknown
}

export interface SectionedPrompt {
  systemPrompt: string
  userPromptTemplate: string
  metadata?: PromptMetadata
  outputFormat?: string
  outputSchema?: Record<string, unknown>
  /** Versi isi prompt, sama dengan `getPromptVersion(nama)`. */
  version: string
}

export interface ParsedPromptFile {
  metadata: PromptMetadata
  systemPrompt: string
  userPromptTemplate: string
  outputFormat?: string
  outputSchema?: Record<string, unknown>
  body: string
  /** Versi isi prompt, sama dengan `getPromptVersion(nama)`. */
  version: string
}

/** Pencatat versi prompt yang dimuat selama satu run. */
export interface PromptVersionTracker {
  /**
   * Menjalankan `fn`; setiap prompt yang dimuat di dalamnya — termasuk lintas `await` — tercatat.
   * Tracker bersarang ikut mencatat ke seluruh tracker luar yang aktif.
   */
  run<T>(fn: () => T): T
  /** `{ "nama-prompt": "versi" }` terurut nama; prompt yang jatuh ke fallback bernilai `"fallback"`. */
  versions(): Record<string, string>
}

/** Penanda versi untuk `loadPrompt(file, fallback)` yang memakai fallback (nama tidak terdaftar). */
export const FALLBACK_PROMPT_VERSION = "fallback"

const trackerScope = new AsyncLocalStorage<ReadonlyArray<Map<string, string>>>()

function recordPromptVersion(name: string, version: string): void {
  for (const loaded of trackerScope.getStore() ?? []) loaded.set(name, version)
}

export function createPromptVersionTracker(): PromptVersionTracker {
  const loaded = new Map<string, string>()
  return {
    run<T>(fn: () => T): T {
      return trackerScope.run([...(trackerScope.getStore() ?? []), loaded], fn)
    },
    versions(): Record<string, string> {
      return Object.fromEntries([...loaded].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    },
  }
}

function normalizePromptName(filename: string): string {
  const trimmed = filename.trim()
  return trimmed.endsWith(".md") ? trimmed.slice(0, -3) : trimmed
}

function findEntry(filename: string): PromptRegistryEntry | undefined {
  const name = normalizePromptName(filename)
  return Object.hasOwn(PROMPT_REGISTRY, name) ? PROMPT_REGISTRY[name] : undefined
}

function unknownPromptMessage(filename: string): string {
  return `[prompts/loader] Prompt "${filename}" tidak terdaftar. Pastikan src/core/shared/prompts/${normalizePromptName(filename)}.md ada, lalu jalankan \`npm run prompts:build\`.`
}

function requireEntry(filename: string): PromptRegistryEntry {
  const entry = findEntry(filename)
  if (!entry) throw new Error(unknownPromptMessage(filename))
  recordPromptVersion(entry.name, entry.version)
  return entry
}

/** Salinan baru per pemanggilan agar mutasi oleh pemanggil tidak mengubah registry bersama. */
function toMetadata(entry: PromptRegistryEntry): PromptMetadata {
  return {
    description: entry.description,
    used_by: [...entry.usedBy],
    usedBy: [...entry.usedBy],
    variables: entry.variables.map((v) => ({ key: v.key, desc: v.desc })),
  }
}

function cloneSchema(schema: PromptRegistryEntry["outputSchema"]): Record<string, unknown> | undefined {
  return schema ? structuredClone(schema) : undefined
}

/**
 * Versi isi prompt (12 heksa pertama sha256), mis. untuk dicatat bersama hasil run.
 * Melempar error bila nama tidak terdaftar.
 */
export function getPromptVersion(filename: string): string {
  const entry = findEntry(filename)
  if (!entry) throw new Error(unknownPromptMessage(filename))
  return entry.version
}

/**
 * Prompt utuh terkompilasi: metadata frontmatter + section + output schema (eksplisit atau hasil infer
 * `[OUTPUT_FORMAT]`). Melempar error bila nama tidak terdaftar.
 */
export function loadParsedPrompt(filename: string): ParsedPromptFile {
  const entry = requireEntry(filename)
  return {
    metadata: toMetadata(entry),
    systemPrompt: entry.systemPrompt,
    userPromptTemplate: entry.userPromptTemplate,
    outputFormat: entry.outputFormat,
    outputSchema: cloneSchema(entry.outputSchema),
    body: entry.body,
    version: entry.version,
  }
}

/**
 * Membaca prompt tunggal (opsional memilih section `system`/`user`). Tanpa `section`: section satu-satunya,
 * atau body mentah bila prompt punya keduanya. Nama tidak terdaftar → `fallback` (wajib satu kalimat
 * keselamatan, lihat prompt-management.md) atau error bila fallback kosong.
 */
export function loadPrompt(
  filename: string,
  fallback: string = "",
  section?: "system" | "user"
): string {
  const entry = findEntry(filename)
  if (!entry) {
    const safeFallback = fallback.trim()
    if (!safeFallback) throw new Error(unknownPromptMessage(filename))
    console.warn(`${unknownPromptMessage(filename)} Memakai fallback.`)
    recordPromptVersion(normalizePromptName(filename), FALLBACK_PROMPT_VERSION)
    return safeFallback
  }
  recordPromptVersion(entry.name, entry.version)

  if (section === "system") return entry.systemPrompt || entry.body
  if (section === "user") return entry.userPromptTemplate || entry.body
  if (entry.userPromptTemplate && !entry.systemPrompt) return entry.userPromptTemplate
  if (entry.systemPrompt && !entry.userPromptTemplate) return entry.systemPrompt
  return entry.body
}

/**
 * Membaca prompt yang memiliki bagian [SYSTEM_PROMPT], [USER_PROMPT], dan [OUTPUT_FORMAT].
 * Melempar error bila nama tidak terdaftar.
 */
export function loadSectionedPrompt(filename: string): SectionedPrompt {
  const parsed = loadParsedPrompt(filename)
  return {
    systemPrompt: parsed.systemPrompt,
    userPromptTemplate: parsed.userPromptTemplate,
    metadata: parsed.metadata,
    outputFormat: parsed.outputFormat,
    outputSchema: parsed.outputSchema,
    version: parsed.version,
  }
}

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

/**
 * Mengganti variabel template `{{namaVariabel}}` dalam satu lintasan: nilai yang memuat `{{…}}` atau pola
 * `$&` tidak diinterpolasi ulang, placeholder tanpa nilai di `variables` dibiarkan, `null`/`undefined` → "".
 * Baris kosong berurutan (dari variabel opsional yang kosong) dirapikan menjadi satu.
 */
export function renderPrompt(
  template: string,
  variables: Record<string, string | number | undefined | null>
): string {
  const result = template.replace(PLACEHOLDER, (placeholder: string, key: string) => {
    if (!Object.hasOwn(variables, key)) return placeholder
    const val = variables[key]
    return val !== undefined && val !== null ? String(val) : ""
  })

  return result
    .split("\n")
    .filter((line, idx, arr) => {
      if (line.trim() === "" && arr[idx - 1]?.trim() === "") return false
      return true
    })
    .join("\n")
    .trim()
}
