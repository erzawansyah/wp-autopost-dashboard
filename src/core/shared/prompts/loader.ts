import fs from "fs"
import path from "path"

/**
 * Utilitas Pemuatan & Interpolasi Prompt Panitera
 * Mendukung arsitektur fleksibel:
 * 1. YAML frontmatter metadata (description, used_by list, variables list of { key, desc })
 * 2. Tag terstruktur:
 *    [SYSTEM_PROMPT] ... [/SYSTEM_PROMPT]
 *    [USER_PROMPT] ... [/USER_PROMPT]
 *    [OUTPUT_FORMAT] ... [/OUTPUT_FORMAT]   <- Contoh JSON visual (key berakhiran '?' = opsional/nullable)
 *    [OUTPUT_SCHEMA] ... [/OUTPUT_SCHEMA]   <- Formal JSON Schema standar (opsional)
 */

const PROMPTS_DIR = path.join(process.cwd(), "src", "core", "shared", "prompts")

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
}

export interface ParsedPromptFile {
  metadata: PromptMetadata
  systemPrompt: string
  userPromptTemplate: string
  outputFormat?: string
  outputSchema?: Record<string, unknown>
  body: string
}

function unquote(str: string): string {
  let s = str.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1)
  }
  return s.trim()
}

/**
 * Menghasilkan JSON Schema standar dari contoh JSON
 * Kunci yang berakhiran '?' otomatis dianggap opsional (tidak masuk required, dan tipe mengizinkan null)
 */
export function inferJsonSchemaFromExample(example: unknown): Record<string, unknown> {
  if (example === null || example === undefined) {
    return { type: ["string", "null"] }
  }

  if (typeof example === "string") {
    return { type: "string" }
  }

  if (typeof example === "number") {
    return Number.isInteger(example) ? { type: "integer" } : { type: "number" }
  }

  if (typeof example === "boolean") {
    return { type: "boolean" }
  }

  if (Array.isArray(example)) {
    return {
      type: "array",
      items: example.length > 0 ? inferJsonSchemaFromExample(example[0]) : { type: "string" },
    }
  }

  if (typeof example === "object") {
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

    const schema: Record<string, unknown> = {
      type: "object",
      properties,
      additionalProperties: false,
    }

    if (required.length > 0) {
      schema.required = required
    }

    return schema
  }

  return { type: "string" }
}

/**
 * Menghapus akhiran '?' dari kunci-kunci objek untuk menghasilkan JSON bersih ramah prompt
 */
export function cleanExampleForPrompt(example: unknown): unknown {
  if (Array.isArray(example)) {
    return example.map(cleanExampleForPrompt)
  }
  if (typeof example === "object" && example !== null) {
    const cleaned: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(example)) {
      const cleanKey = key.endsWith("?") ? key.slice(0, -1).trim() : key.trim()
      cleaned[cleanKey] = cleanExampleForPrompt(val)
    }
    return cleaned
  }
  return example
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
  const metadata: PromptMetadata = {
    used_by: [],
    usedBy: [],
    variables: [],
  }

  const lines = yamlBlock.split(/\r?\n/)
  let currentSection: "none" | "used_by" | "variables" = "none"
  let currentVarObj: PromptVariableMeta | null = null

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim() || line.trim().startsWith("#")) continue

    const topKeyMatch = line.match(/^([a-zA-Z0-9_\-]+):\s*(.*)$/)
    if (topKeyMatch && !line.startsWith(" ") && !line.startsWith("\t") && !line.startsWith("-")) {
      const rawKey = topKeyMatch[1].toLowerCase().replace(/-/g, "_")
      const inlineVal = topKeyMatch[2].trim()

      if (rawKey === "description" || rawKey === "desc") {
        currentSection = "none"
        metadata.description = unquote(inlineVal)
      } else if (rawKey === "used_by" || rawKey === "usedby") {
        currentSection = "used_by"
        if (inlineVal) {
          const items = inlineVal.split(",").map((s) => unquote(s.trim())).filter(Boolean)
          metadata.used_by = items
          metadata.usedBy = items
        }
      } else if (rawKey === "variables" || rawKey === "vars") {
        currentSection = "variables"
        if (inlineVal) {
          const cleaned = inlineVal.replace(/^\[/, "").replace(/\]$/, "")
          metadata.variables = cleaned
            .split(",")
            .map((s) => ({ key: unquote(s.trim()), desc: "" }))
            .filter((v) => v.key)
        }
      } else {
        currentSection = "none"
        metadata[rawKey] = unquote(inlineVal)
      }
      continue
    }

    if (currentSection === "used_by") {
      const itemMatch = line.match(/^\s*-\s+(.*)$/)
      if (itemMatch) {
        const item = unquote(itemMatch[1].trim())
        if (item) {
          metadata.used_by?.push(item)
          metadata.usedBy?.push(item)
        }
      }
      continue
    }

    if (currentSection === "variables") {
      const newVarKeyMatch = line.match(/^\s*-\s+key:\s*(.*)$/i)
      if (newVarKeyMatch) {
        currentVarObj = { key: unquote(newVarKeyMatch[1].trim()), desc: "" }
        metadata.variables?.push(currentVarObj)
        continue
      }

      const simpleVarMatch = line.match(/^\s*-\s+([a-zA-Z0-9_]+)$/)
      if (simpleVarMatch && !line.includes(":")) {
        currentVarObj = { key: unquote(simpleVarMatch[1].trim()), desc: "" }
        metadata.variables?.push(currentVarObj)
        continue
      }

      const descMatch = line.match(/^\s+desc(?:ription)?:\s*(.*)$/i)
      if (descMatch && currentVarObj) {
        currentVarObj.desc = unquote(descMatch[1].trim())
        continue
      }

      const subKeyMatch = line.match(/^\s+key:\s*(.*)$/i)
      if (subKeyMatch && currentVarObj) {
        currentVarObj.key = unquote(subKeyMatch[1].trim())
        continue
      }
    }
  }

  return { metadata, body }
}

/**
 * Mencari path file prompt di disk dengan toleransi variasi prefix
 */
function findPromptFilePath(filename: string): string | null {
  const cleanName = filename.trim()

  let p = path.join(PROMPTS_DIR, cleanName)
  if (fs.existsSync(p)) return p

  if (!cleanName.endsWith(".md")) {
    p = path.join(PROMPTS_DIR, `${cleanName}.md`)
    if (fs.existsSync(p)) return p
  }

  // 3. Resolusi untuk prefix agent- (dan backwards compatibility untuk preset-)
  if (cleanName.startsWith("preset-")) {
    const agentName = cleanName.replace(/^preset-/, "agent-")
    const agentPath = path.join(PROMPTS_DIR, agentName.endsWith(".md") ? agentName : `${agentName}.md`)
    if (fs.existsSync(agentPath)) return agentPath
  }

  if (cleanName === "user-prompt" || cleanName === "user-prompt.md") {
    const agentUserPath = path.join(PROMPTS_DIR, "agent-user-prompt.md")
    if (fs.existsSync(agentUserPath)) return agentUserPath
  }

  if (!cleanName.startsWith("agent-") && !cleanName.startsWith("system-") && !cleanName.startsWith("wp-tools-")) {
    const agentPath = path.join(PROMPTS_DIR, `agent-${cleanName}${cleanName.endsWith(".md") ? "" : ".md"}`)
    if (fs.existsSync(agentPath)) return agentPath
  }

  // 4. Jika untuk tools (prefix wp-tools-)
  if (!cleanName.startsWith("wp-tools-")) {
    const wpPath = path.join(PROMPTS_DIR, `wp-tools-${cleanName}`)
    if (fs.existsSync(wpPath)) return wpPath

    const unTool = cleanName.replace(/^(system-tool-|tools-)/, "")
    const wpPath2 = path.join(PROMPTS_DIR, `wp-tools-${unTool}`)
    if (fs.existsSync(wpPath2)) return wpPath2
  }

  // 5. Jika prefix system-
  if (!cleanName.startsWith("system-") && !cleanName.startsWith("agent-") && !cleanName.startsWith("wp-tools-")) {
    const sysPath = path.join(PROMPTS_DIR, `system-${cleanName}`)
    if (fs.existsSync(sysPath)) return sysPath
  }

  // 6. Coba hilangkan prefix jika ada
  if (cleanName.startsWith("system-") || cleanName.startsWith("wp-tools-") || cleanName.startsWith("agent-")) {
    const base = cleanName.replace(/^(system-|wp-tools-|agent-)/, "")
    const basePath = path.join(PROMPTS_DIR, base)
    if (fs.existsSync(basePath)) return basePath

    if (cleanName.startsWith("system-tool-")) {
      const swapped = path.join(PROMPTS_DIR, cleanName.replace(/^system-tool-/, "wp-tools-"))
      if (fs.existsSync(swapped)) return swapped
    }
  }

  return null
}

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
 * Mengekstrak [SYSTEM_PROMPT], [USER_PROMPT], [OUTPUT_FORMAT], dan [OUTPUT_SCHEMA]
 */
export function extractPromptSections(body: string): {
  systemPrompt: string
  userPromptTemplate: string
  outputFormat?: string
  outputSchema?: Record<string, unknown>
} {
  let systemPrompt = ""
  let userPromptTemplate = ""
  let outputFormat: string | undefined
  let outputSchema: Record<string, unknown> | undefined

  // 1. Tag [SYSTEM_PROMPT]
  const sysMatch = body.match(/\[SYSTEM_PROMPT\]([\s\S]*?)\[\/SYSTEM_PROMPT\]/i)
  if (sysMatch) {
    systemPrompt = sysMatch[1].trim()
  }

  // 2. Tag [USER_PROMPT]
  const userMatch = body.match(/\[USER_PROMPT\]([\s\S]*?)\[\/USER_PROMPT\]/i)
  if (userMatch) {
    userPromptTemplate = userMatch[1].trim()
  }

  // 3. Tag [OUTPUT_SCHEMA] (formal JSON Schema jika ada)
  const schemaMatch = body.match(/\[OUTPUT_SCHEMA\]([\s\S]*?)\[\/OUTPUT_SCHEMA\]/i)
  if (schemaMatch) {
    const rawSchema = schemaMatch[1].trim()
    try {
      outputSchema = JSON.parse(rawSchema)
    } catch (err) {
      console.warn("[loader] Format [OUTPUT_SCHEMA] bukan JSON valid:", err)
    }
  }

  // 4. Tag [OUTPUT_FORMAT] (contoh JSON visual fleksibel dengan '?')
  const formatMatch = body.match(/\[OUTPUT_FORMAT\]([\s\S]*?)\[\/OUTPUT_FORMAT\]/i)
  if (formatMatch) {
    const rawFormat = formatMatch[1].trim()
    outputFormat = rawFormat

    try {
      const parsedExample = JSON.parse(rawFormat)
      // Infer JSON Schema otomatis jika belum disuplai lewat [OUTPUT_SCHEMA]
      if (!outputSchema) {
        outputSchema = inferJsonSchemaFromExample(parsedExample)
      }

      // Bersihkan tanda '?' untuk disematkan secara alami ke instruksi prompt pengguna
      const cleanExample = cleanExampleForPrompt(parsedExample)
      const cleanExampleStr = JSON.stringify(cleanExample, null, 2)

      // Jika userPromptTemplate belum memuat instruksi JSON, sertakan secara otomatis
      if (!userPromptTemplate.includes("Keluarkan JSON") && !userPromptTemplate.includes("JSON format")) {
        userPromptTemplate = `${userPromptTemplate}\n\nKeluarkan JSON murni persis dengan format berikut:\n${cleanExampleStr}`.trim()
      }
    } catch (err) {
      console.warn("[loader] Format [OUTPUT_FORMAT] bukan JSON valid:", err)
    }
  }

  // Jika tag ditemukan, kembalikan langsung
  if (systemPrompt || userPromptTemplate || outputFormat) {
    return { systemPrompt, userPromptTemplate, outputFormat, outputSchema }
  }

  // Fallback backward-compatible
  const legacyParts = body.split(/^---\s*$/m)
  if (legacyParts.length >= 2) {
    const sysPart = legacyParts[0].replace(/^#\s*SYSTEM\s*PROMPT\s*/i, "").trim()
    const userPart = legacyParts[1].replace(/^#\s*USER\s*PROMPT\s*(?:TEMPLATE)?\s*/i, "").trim()
    return {
      systemPrompt: sysPart,
      userPromptTemplate: userPart,
    }
  }

  return { systemPrompt: body, userPromptTemplate: "" }
}

/**
 * Mem-parse file prompt secara menyeluruh: Metadata YAML + Section Tags + Output Schema
 */
export function loadParsedPrompt(filename: string): ParsedPromptFile {
  const raw = readPromptRaw(filename)
  if (!raw) {
    return { metadata: {}, systemPrompt: "", userPromptTemplate: "", body: "" }
  }

  const { metadata, body } = parsePromptFrontmatter(raw)
  const { systemPrompt, userPromptTemplate, outputFormat, outputSchema } = extractPromptSections(body)

  return {
    metadata,
    systemPrompt,
    userPromptTemplate,
    outputFormat,
    outputSchema,
    body,
  }
}

/**
 * Membaca prompt tunggal (dengan opsi memilih section 'system' atau 'user')
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

  if (parsed.userPromptTemplate && !parsed.systemPrompt) {
    return parsed.userPromptTemplate
  }
  if (parsed.systemPrompt && !parsed.userPromptTemplate) {
    return parsed.systemPrompt
  }

  return parsed.body || fallback.trim()
}

/**
 * Membaca prompt yang memiliki bagian [SYSTEM_PROMPT], [USER_PROMPT], dan [OUTPUT_FORMAT]
 */
export function loadSectionedPrompt(filename: string): SectionedPrompt {
  const parsed = loadParsedPrompt(filename)
  return {
    systemPrompt: parsed.systemPrompt,
    userPromptTemplate: parsed.userPromptTemplate,
    metadata: parsed.metadata,
    outputFormat: parsed.outputFormat,
    outputSchema: parsed.outputSchema,
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

  return result
    .split("\n")
    .filter((line, idx, arr) => {
      if (line.trim() === "" && arr[idx - 1]?.trim() === "") return false
      return true
    })
    .join("\n")
    .trim()
}
