import fs from "fs"
import path from "path"

export interface PromptVariableDefinition {
  name: string
  required?: boolean
  description?: string
  default?: string
}

export interface PromptMetadata {
  node?: string
  description?: string
  version?: string
  variables?: PromptVariableDefinition[]
  [key: string]: unknown
}

export interface LoadedPrompt {
  metadata: PromptMetadata
  rawContent: string
  sections: Record<string, string>
  systemPrompt: string
  userPrompt: string
  getSection(name: string): string
  render(sectionName: string, variables?: Record<string, unknown>): string
  renderSystemPrompt(variables?: Record<string, unknown>): string
  renderUserPrompt(variables?: Record<string, unknown>): string
}

/**
 * Parsing sederhana dan tangguh untuk frontmatter YAML/TOML di awal berkas.
 * Menghindari dependensi eksternal berat namun mendukung key-value dan list variables.
 */
export function parseFrontmatter(content: string): { metadata: PromptMetadata; body: string } {
  const trimmed = content.trimStart()
  if (!trimmed.startsWith("---")) {
    return { metadata: {}, body: content }
  }

  const endIndex = trimmed.indexOf("\n---", 3)
  if (endIndex === -1) {
    return { metadata: {}, body: content }
  }

  const frontmatterStr = trimmed.slice(3, endIndex).trim()
  const body = trimmed.slice(endIndex + 4).trimStart()

  const metadata: PromptMetadata = {}
  const lines = frontmatterStr.split("\n")
  let currentKey = ""
  let currentList: any[] = []
  let inList = false
  let currentListItem: Record<string, any> | null = null

  for (let rawLine of lines) {
    const line = rawLine.replace(/\r$/, "")
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue
    }

    // List item parsing (- name: "...")
    if (trimmedLine.startsWith("-")) {
      const itemContent = trimmedLine.slice(1).trim()
      if (itemContent.includes(":")) {
        currentListItem = {}
        const [k, ...vParts] = itemContent.split(":")
        const key = k.trim()
        const val = cleanValue(vParts.join(":").trim())
        currentListItem[key] = val
        if (inList) {
          currentList.push(currentListItem)
        }
      } else {
        if (inList) {
          currentList.push(cleanValue(itemContent))
        }
      }
      continue
    }

    // Indented sub-property of list item (e.g. '    required: true')
    if (line.startsWith("  ") && currentListItem && trimmedLine.includes(":")) {
      const [k, ...vParts] = trimmedLine.split(":")
      const key = k.trim()
      const val = cleanValue(vParts.join(":").trim())
      currentListItem[key] = val
      continue
    }

    // Top-level key: value
    const colonIndex = trimmedLine.indexOf(":")
    if (colonIndex !== -1) {
      if (inList && currentKey) {
        metadata[currentKey] = currentList
        inList = false
        currentListItem = null
      }

      const key = trimmedLine.slice(0, colonIndex).trim()
      const rawVal = trimmedLine.slice(colonIndex + 1).trim()

      if (rawVal === "") {
        currentKey = key
        currentList = []
        inList = true
        currentListItem = null
      } else {
        metadata[key] = cleanValue(rawVal)
        currentKey = ""
      }
    }
  }

  if (inList && currentKey) {
    metadata[currentKey] = currentList
  }

  return { metadata, body }
}

function cleanValue(val: string): any {
  if (val === "true") return true
  if (val === "false") return false
  if (!isNaN(Number(val)) && val !== "") return Number(val)
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1)
  }
  return val
}

/**
 * Ekstraksi blok section berformat [TAG_NAME] ... [/TAG_NAME]
 */
export function extractSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const sectionRegex = /\[([A-Z0-9_]+)\]([\s\S]*?)\[\/\1\]/gi

  let match: RegExpExecArray | null
  while ((match = sectionRegex.exec(content)) !== null) {
    const sectionName = match[1].toUpperCase()
    const sectionBody = match[2].trim()
    sections[sectionName] = sectionBody
  }

  return sections
}

/**
 * Interpolasi variabel {{variableName}} pada template prompt
 */
export function interpolateVariables(template: string, variables: Record<string, unknown> = {}): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, varName) => {
    if (varName in variables) {
      const val = variables[varName]
      if (val === null || val === undefined) return ""
      if (typeof val === "object") return JSON.stringify(val, null, 2)
      return String(val)
    }
    return match
  })
}

/**
 * Parser string markdown mentah menjadi objek LoadedPrompt
 */
export function parsePromptMarkdown(rawContent: string): LoadedPrompt {
  const { metadata, body } = parseFrontmatter(rawContent)
  const sections = extractSections(body)

  const systemPrompt = sections["SYSTEM_PROMPT"] || ""
  const userPrompt = sections["USER_PROMPT"] || ""

  return {
    metadata,
    rawContent,
    sections,
    systemPrompt,
    userPrompt,
    getSection(name: string): string {
      return sections[name.toUpperCase()] || ""
    },
    render(sectionName: string, variables: Record<string, unknown> = {}): string {
      const rawSection = sections[sectionName.toUpperCase()] || ""
      return interpolateVariables(rawSection, variables)
    },
    renderSystemPrompt(variables: Record<string, unknown> = {}): string {
      return interpolateVariables(systemPrompt, variables)
    },
    renderUserPrompt(variables: Record<string, unknown> = {}): string {
      return interpolateVariables(userPrompt, variables)
    },
  }
}

// In-memory cache agar file tidak dibaca berulang kali dari disk
const promptCache = new Map<string, LoadedPrompt>()

/**
 * Memuat berkas prompt.md berdasarkan nama folder node di src/core/writer/nodes/<nodeName>/prompt.md
 */
export function loadNodePrompt(nodeName: string, fallbackContent?: string): LoadedPrompt {
  const cached = promptCache.get(nodeName)
  if (cached) {
    return cached
  }

  const possiblePaths = [
    path.join(process.cwd(), "src", "core", "writer", "nodes", nodeName, "prompt.md"),
    path.join(__dirname, "..", "nodes", nodeName, "prompt.md"),
    path.resolve(process.cwd(), "src/core/writer/nodes", nodeName, "prompt.md"),
  ]

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, "utf-8")
        const parsed = parsePromptMarkdown(raw)
        promptCache.set(nodeName, parsed)
        return parsed
      } catch (readErr) {
        console.warn(`[prompt-loader] Gagal membaca berkas ${filePath}:`, readErr)
      }
    }
  }

  if (fallbackContent) {
    const fallbackParsed = parsePromptMarkdown(fallbackContent)
    promptCache.set(nodeName, fallbackParsed)
    return fallbackParsed
  }

  throw new Error(`[prompt-loader] Berkas prompt.md untuk node "${nodeName}" tidak ditemukan di jalur yang dicari.`)
}

/**
 * Bersihkan cache prompt (berguna untuk pengujian atau hot-reload)
 */
export function clearPromptCache(): void {
  promptCache.clear()
}
