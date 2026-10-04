import fs from "fs"
import path from "path"

/**
 * Utilitas Pemuatan & Interpolasi Prompt Panitera
 * Memastikan semua prompt (system, user, guardrails, wp-tools) tersimpan di file terpisah
 * di dalam folder `src/core/shared/prompts/` dengan format metadata YAML dan tag pembungkus:
 *
 * ---
 * used-by: daftar script/file yang menggunakan prompt ini, dipisahkan koma
 * description: penjelasan singkat digunakan untuk apa
 * variables: daftar variabel yang bisa diinject ke prompt ini
 * ---
 *
 * [SYSTEM_PROMPT]
 * <prompt yang akan diload>
 * [/SYSTEM_PROMPT]
 *
 * [USER_PROMPT]
 * <prompt yang akan diload>
 * [/USER_PROMPT]
 */

const PROMPTS_DIR = path.join(process.cwd(), "src", "core", "shared", "prompts")

export interface PromptMetadata {
  usedBy?: string[]
  description?: string
  variables?: string[]
  [key: string]: unknown
}

export interface SectionedPrompt {
  systemPrompt: string
  userPromptTemplate: string
  metadata?: PromptMetadata
}

export interface ParsedPromptFile {
  metadata: PromptMetadata
  systemPrompt: string
  userPromptTemplate: string
  body: string
}

/**
 * Mencari path file prompt di disk dengan toleransi variasi prefix:
 * 1. Nama persis
 * 2. Prefix 'wp-tools-' (untuk tools WP)
 * 3. Prefix 'system-' (untuk engine sistem/guardrail)
 * 4. Tanpa prefix
 */
function findPromptFilePath(filename: string): string | null {
  const cleanName = filename.trim()

  // 1. Coba nama persis
  let p = path.join(PROMPTS_DIR, cleanName)
  if (fs.existsSync(p)) return p

  // 2. Jika tanpa ekstensi .md
  if (!cleanName.endsWith(".md")) {
    p = path.join(PROMPTS_DIR, `${cleanName}.md`)
    if (fs.existsSync(p)) return p
  }

  // 3. Jika untuk tools (prefix wp-tools-)
  if (!cleanName.startsWith("wp-tools-")) {
    const wpPath = path.join(PROMPTS_DIR, `wp-tools-${cleanName}`)
    if (fs.existsSync(wpPath)) return wpPath

    // Coba jika nama berawalan "system-tool-" atau "tools-"
    const unTool = cleanName.replace(/^(system-tool-|tools-)/, "")
    const wpPath2 = path.join(PROMPTS_DIR, `wp-tools-${unTool}`)
    if (fs.existsSync(wpPath2)) return wpPath2
  }

  // 4. Jika prefix system-
  if (!cleanName.startsWith("system-") && !cleanName.startsWith("user-") && !cleanName.startsWith("wp-tools-")) {
    const sysPath = path.join(PROMPTS_DIR, `system-${cleanName}`)
    if (fs.existsSync(sysPath)) return sysPath
  }

  // 5. Coba hilangkan prefix system- atau wp-tools- jika ada
  if (cleanName.startsWith("system-") || cleanName.startsWith("wp-tools-")) {
    const base = cleanName.replace(/^(system-|wp-tools-)/, "")
    const basePath = path.join(PROMPTS_DIR, base)
    if (fs.existsSync(basePath)) return basePath

    // Fallback swap jika sebelumnya dipanggil system-tool-
    if (cleanName.startsWith("system-tool-")) {
      const swapped = path.join(PROMPTS_DIR, cleanName.replace(/^system-tool-/, "wp-tools-"))
      if (fs.existsSync(swapped)) return swapped
    }
  }

  return null
}

/**
 * Membaca file prompt mentah dari disk
 */
function readPromptRaw(filename: string): string {
  try {
    const resolvedPath = findPromptFilePath(filename)
    if (resolvedPath && fs.existsSync(resolvedPath)) {
      return fs.readFileSync(resolvedPath, "utf-8").trim()
    }
  } catch (err) {
    console.warn(`[prompts/loader] Gagal membaca file prompt ${filename} dari disk:`, err)
  }
  return ""
}

/**
 * Mem-parse frontmatter YAML pada awal file
 */
export function parsePromptFrontmatter(rawContent: string): { metadata: PromptMetadata; body: string } {
  const trimmed = rawContent.trim()
  if (!trimmed.startsWith("---")) {
    return { metadata: {}, body: trimmed }
  }

  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) {
    return { metadata: {}, body: trimmed }
  }

  const yamlBlock = match[1]
  const body = match[2].trim()
  const metadata: PromptMetadata = {}

  for (const line of yamlBlock.split("\n")) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith("#")) continue

    const colonIdx = trimmedLine.indexOf(":")
    if (colonIdx === -1) continue

    const key = trimmedLine.slice(0, colonIdx).trim().toLowerCase()
    let val = trimmedLine.slice(colonIdx + 1).trim()

    // Hapus kutip luar jika ada
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }

    if (key === "used-by" || key === "usedby" || key === "used_by") {
      metadata.usedBy = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (key === "variables" || key === "vars") {
      const cleaned = val.replace(/^\[/, "").replace(/\]$/, "")
      metadata.variables = cleaned
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (key === "description" || key === "desc") {
      metadata.description = val
    } else {
      metadata[key] = val
    }
  }

  return { metadata, body }
}

/**
 * Mengekstrak [SYSTEM_PROMPT] dan [USER_PROMPT] dari teks body
 */
export function extractPromptSections(body: string): { systemPrompt: string; userPromptTemplate: string } {
  let systemPrompt = ""
  let userPromptTemplate = ""

  // 1. Ekstraksi dengan tag [SYSTEM_PROMPT]...[/SYSTEM_PROMPT]
  const sysTagMatch = body.match(/\[SYSTEM_PROMPT\]([\s\S]*?)\[\/SYSTEM_PROMPT\]/i)
  if (sysTagMatch) {
    systemPrompt = sysTagMatch[1].trim()
  }

  // 2. Ekstraksi dengan tag [USER_PROMPT]...[/USER_PROMPT]
  const userTagMatch = body.match(/\[USER_PROMPT\]([\s\S]*?)\[\/USER_PROMPT\]/i)
  if (userTagMatch) {
    userPromptTemplate = userTagMatch[1].trim()
  }

  if (systemPrompt || userPromptTemplate) {
    return { systemPrompt, userPromptTemplate }
  }

  // 3. Fallback backward-compatible: jika menggunakan pemisah legacy markdown (# SYSTEM PROMPT / # USER PROMPT TEMPLATE atau ---)
  const legacyParts = body.split(/^---\s*$/m)
  if (legacyParts.length >= 2) {
    const sysPart = legacyParts[0].replace(/^#\s*SYSTEM\s*PROMPT\s*/i, "").trim()
    const userPart = legacyParts[1].replace(/^#\s*USER\s*PROMPT\s*(?:TEMPLATE)?\s*/i, "").trim()
    return {
      systemPrompt: sysPart,
      userPromptTemplate: userPart,
    }
  }

  // 4. Default: Jika tidak ada tag sama sekali
  return { systemPrompt: body, userPromptTemplate: "" }
}

/**
 * Mem-parse file prompt secara menyeluruh: Metadata YAML + Section Tags
 */
export function loadParsedPrompt(filename: string): ParsedPromptFile {
  const raw = readPromptRaw(filename)
  if (!raw) {
    return { metadata: {}, systemPrompt: "", userPromptTemplate: "", body: "" }
  }

  const { metadata, body } = parsePromptFrontmatter(raw)
  const { systemPrompt, userPromptTemplate } = extractPromptSections(body)

  return {
    metadata,
    systemPrompt,
    userPromptTemplate,
    body,
  }
}

/**
 * Membaca prompt tunggal (dengan opsi memilih section 'system' atau 'user').
 * Jika section tidak ditentukan:
 * - Mengembalikan section yang tersedia jika hanya ada salah satu (misal hanya [SYSTEM_PROMPT] atau hanya [USER_PROMPT])
 * - Mengembalikan seluruh isi body jika keduanya ada atau tanpa tag
 */
export function loadPrompt(
  filename: string,
  fallback: string = "",
  section?: "system" | "user"
): string {
  const parsed = loadParsedPrompt(filename)
  if (!parsed.body && !parsed.systemPrompt && !parsed.userPromptTemplate) {
    return fallback.trim()
  }

  if (section === "system") {
    return parsed.systemPrompt || parsed.body || fallback.trim()
  }
  if (section === "user") {
    return parsed.userPromptTemplate || parsed.body || fallback.trim()
  }

  // Jika tidak dispesifikasikan:
  if (parsed.userPromptTemplate && !parsed.systemPrompt) {
    return parsed.userPromptTemplate
  }
  if (parsed.systemPrompt && !parsed.userPromptTemplate) {
    return parsed.systemPrompt
  }

  return parsed.body || fallback.trim()
}

/**
 * Membaca prompt yang memiliki bagian [SYSTEM_PROMPT] dan [USER_PROMPT]
 */
export function loadSectionedPrompt(filename: string): SectionedPrompt {
  const parsed = loadParsedPrompt(filename)
  return {
    systemPrompt: parsed.systemPrompt,
    userPromptTemplate: parsed.userPromptTemplate,
    metadata: parsed.metadata,
  }
}

/**
 * Mengganti variabel template dengan format {{variableName}}
 */
export function renderPrompt(
  template: string,
  variables: Record<string, string | number | undefined | null>
): string {
  let result = template

  for (const [key, val] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g")
    const replacement = val !== undefined && val !== null ? String(val) : ""
    result = result.replace(regex, replacement)
  }

  // Bersihkan baris-baris kosong berlebih yang tertinggal dari variabel opsional yang kosong
  return result
    .split("\n")
    .filter((line, idx, arr) => {
      if (line.trim() === "" && arr[idx - 1]?.trim() === "") return false
      return true
    })
    .join("\n")
    .trim()
}
