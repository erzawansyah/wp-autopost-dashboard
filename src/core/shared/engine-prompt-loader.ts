import fs from "fs"
import path from "path"
import {
  extractSections,
  interpolateVariables,
  loadNodePrompt,
} from "./prompt-loader"

export interface EngineNodePrompt {
  nodeId: string
  systemPrompt: string
  userPrompt: string
  outputFormat?: string
  sections: Record<string, string>
  getSection(name: string): string
  render(sectionName: string, variables?: Record<string, unknown>): string
  renderSystemPrompt(variables?: Record<string, unknown>): string
  renderUserPrompt(variables?: Record<string, unknown>): string
}

export type EnginePromptsMap = Record<string, EngineNodePrompt>

// Cache in-memory untuk prompt engine
const enginePromptsCache = new Map<string, EnginePromptsMap>()

/**
 * Ekstraksi blok section: mendukung tag [TAG]...[/TAG] maupun Markdown heading ### [TAG]
 */
function extractFlexibleSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {}

  // 1. Coba pola berpasangan [TAG]...[/TAG]
  const pairedRegex = /\[([A-Z0-9_]+)\]([\s\S]*?)\[\/\1\]/gi
  let match: RegExpExecArray | null
  let hasPaired = false
  while ((match = pairedRegex.exec(content)) !== null) {
    hasPaired = true
    sections[match[1].toUpperCase()] = match[2].trim()
  }

  if (hasPaired) {
    return sections
  }

  // 2. Pola heading: ### [SECTION_NAME] atau ### SECTION_NAME
  // PENTING: Hanya potong jika heading berikutnya benar-benar adalah section pembatas resmi
  // agar sub-heading markdown (### I. ..., ### 1. ...) di dalam isi prompt tidak memotong teks.
  const knownSections = "(?:SYSTEM_PROMPT|USER_PROMPT|OUTPUT_FORMAT|PROMPT)"
  const headingRegex = new RegExp(
    `#{2,4}\\s*\\[?(${knownSections})\\]?\\s*([\\s\\S]*?)(?=(?:#{2,4}\\s*\\[?${knownSections}\\]?|$))`,
    "gi"
  )

  while ((match = headingRegex.exec(content)) !== null) {
    const secName = match[1].toUpperCase()
    const secContent = match[2].trim()
    sections[secName] = secContent
  }

  return sections
}

/**
 * Parsing berkas Markdown kumpulan prompt engine (misal: quick-engine-prompts.md)
 */
export function parseEnginePromptsMarkdown(rawContent: string): EnginePromptsMap {
  const result: EnginePromptsMap = {}

  // Regex mencari blok node: ## [NODE: node_name] ...
  const nodeBlockRegex = /##\s*\[NODE:\s*([a-zA-Z0-9_\-]+)\]([\s\S]*?)(?=(?:##\s*\[NODE:|$))/gi

  let match: RegExpExecArray | null
  while ((match = nodeBlockRegex.exec(rawContent)) !== null) {
    const nodeId = match[1].trim()
    const blockContent = match[2].trim()

    const sections = extractFlexibleSections(blockContent)
    const systemPrompt = sections["SYSTEM_PROMPT"] || ""
    const userPrompt = sections["USER_PROMPT"] || ""
    const outputFormat = sections["OUTPUT_FORMAT"] || undefined

    result[nodeId] = {
      nodeId,
      systemPrompt,
      userPrompt,
      outputFormat,
      sections,
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

  return result
}

/**
 * Memuat seluruh prompt default untuk suatu Writing Engine dari src/core/prompts/{engineId}-engine-prompts.md
 */
export function loadEnginePrompts(engineId: string): EnginePromptsMap {
  const normalizedEngineId = engineId.toLowerCase()
  const cached = enginePromptsCache.get(normalizedEngineId)
  if (cached) {
    return cached
  }

  const possiblePaths = [
    path.join(process.cwd(), "src", "core", "prompts", `${normalizedEngineId}-engine-prompts.md`),
    path.resolve(process.cwd(), `src/core/prompts/${normalizedEngineId}-engine-prompts.md`),
    path.join(__dirname, "..", "prompts", `${normalizedEngineId}-engine-prompts.md`),
  ]

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, "utf-8")
        const parsed = parseEnginePromptsMarkdown(raw)
        enginePromptsCache.set(normalizedEngineId, parsed)
        return parsed
      } catch (err) {
        console.warn(`[engine-prompt-loader] Gagal membaca berkas prompt engine di ${filePath}:`, err)
      }
    }
  }

  return {}
}

/**
 * Mengambil prompt node tertentu untuk suatu engine.
 * Jika tidak ditemukan di file engine, fallback ke loadNodePrompt per node.
 */
export function loadEngineNodePrompt(engineId: string, nodeId: string): EngineNodePrompt {
  const enginePrompts = loadEnginePrompts(engineId)
  if (enginePrompts[nodeId]) {
    return enginePrompts[nodeId]
  }

  // Fallback: baca dari node prompt individual (src/core/writer/nodes/{nodeId}/prompt.md)
  try {
    const loaded = loadNodePrompt(nodeId)
    return {
      nodeId,
      systemPrompt: loaded.systemPrompt,
      userPrompt: loaded.userPrompt,
      outputFormat: loaded.getSection("OUTPUT_FORMAT") || undefined,
      sections: loaded.sections,
      getSection: (name) => loaded.getSection(name),
      render: (name, vars) => loaded.render(name, vars),
      renderSystemPrompt: (vars) => loaded.renderSystemPrompt(vars),
      renderUserPrompt: (vars) => loaded.renderUserPrompt(vars),
    }
  } catch (err) {
    console.warn(`[engine-prompt-loader] Fallback node prompt "${nodeId}" juga tidak ditemukan:`, err)
    // Return empty prompt template yang aman
    return {
      nodeId,
      systemPrompt: "",
      userPrompt: "",
      sections: {},
      getSection: () => "",
      render: () => "",
      renderSystemPrompt: () => "",
      renderUserPrompt: () => "",
    }
  }
}

/**
 * Menggabungkan prompt default engine dengan override kustom dari pengguna (SaaS prompt modification)
 */
export function mergeEnginePromptOverrides(
  defaultPrompts: EnginePromptsMap,
  userOverrides?: Record<string, { systemPrompt?: string; userPrompt?: string }>
): EnginePromptsMap {
  if (!userOverrides) return defaultPrompts

  const merged: EnginePromptsMap = { ...defaultPrompts }

  for (const [nodeId, override] of Object.entries(userOverrides)) {
    const existing = merged[nodeId]
    if (existing) {
      const systemPrompt = override.systemPrompt ?? existing.systemPrompt
      const userPrompt = override.userPrompt ?? existing.userPrompt

      merged[nodeId] = {
        ...existing,
        systemPrompt,
        userPrompt,
        renderSystemPrompt(vars) {
          return interpolateVariables(systemPrompt, vars)
        },
        renderUserPrompt(vars) {
          return interpolateVariables(userPrompt, vars)
        },
      }
    }
  }

  return merged
}

/**
 * Bersihkan cache prompt engine
 */
export function clearEnginePromptCache(): void {
  enginePromptsCache.clear()
}
