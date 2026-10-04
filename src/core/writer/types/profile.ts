import { z } from "zod"
import { DecryptedUserKeys } from "@/types/settings"
import settingsConfig from "@/core/shared/settings.json"

export type AgentMode = "standard" | "deep"

export interface AgentLimits {
  /** Maksimal pemanggilan model LLM per satu run */
  maxModelCalls: number
  /** Maksimal total pemanggilan tools per satu run */
  maxToolCalls: number
  /** Timeout maksimum proses eksekusi dalam detik */
  timeoutSeconds: number
  /** Target minimal jumlah kata artikel yang harus dihasilkan */
  minWordCount: number
  /** Batas pemanggilan spesifik per-tool, misal { web_reader: 5, upload_media: 4 } */
  perTool: Record<string, number>
}

/** Batas mutlak sistem (Hard Ceiling Guard) untuk mencegah abuse atau runaway execution */
export const SYSTEM_LIMIT_BOUNDS = {
  minModelCalls: settingsConfig.systemBounds.minModelCalls,
  maxModelCalls: settingsConfig.systemBounds.maxModelCalls,
  minToolCalls: settingsConfig.systemBounds.minToolCalls,
  maxToolCalls: settingsConfig.systemBounds.maxToolCalls,
  minTimeoutSeconds: settingsConfig.systemBounds.minTimeoutSeconds,
  maxTimeoutSeconds: settingsConfig.systemBounds.maxTimeoutSeconds,
  minWordCount: settingsConfig.systemBounds.minWordCount,
  maxWordCount: settingsConfig.systemBounds.maxWordCount,
  defaultPerToolLimit: settingsConfig.systemBounds.defaultPerToolLimit,
}

/**
 * Daftar tools WordPress inti yang wajib selalu terpasang pada setiap agent
 */
export const MANDATORY_TOOL_IDS = [
  "upload_media",
  "list_wp_categories",
  "list_wp_tags",
  "list_wp_authors",
] as const

export const MANDATORY_TOOL_ALIASES = [
  "list_categories",
  "list_tags",
  "list_authors",
] as const

export const ALL_MANDATORY_TOOL_IDS = [
  ...MANDATORY_TOOL_IDS,
  ...MANDATORY_TOOL_ALIASES,
] as const

export function ensureMandatoryToolIds(toolIds: string[] = []): string[] {
  const safeList = Array.isArray(toolIds) ? toolIds : []
  return Array.from(new Set([...safeList, ...MANDATORY_TOOL_IDS]))
}

export const DEFAULT_STANDARD_LIMITS: AgentLimits = {
  maxModelCalls: settingsConfig.standardLimits.maxModelCalls,
  maxToolCalls: settingsConfig.standardLimits.maxToolCalls,
  timeoutSeconds: settingsConfig.standardLimits.timeoutSeconds,
  minWordCount: settingsConfig.standardLimits.minWordCount,
  perTool: { ...settingsConfig.standardLimits.perTool },
}

export const DEFAULT_DEEP_LIMITS: AgentLimits = {
  maxModelCalls: settingsConfig.deepLimits.maxModelCalls,
  maxToolCalls: settingsConfig.deepLimits.maxToolCalls,
  timeoutSeconds: settingsConfig.deepLimits.timeoutSeconds,
  minWordCount: settingsConfig.deepLimits.minWordCount,
  perTool: { ...settingsConfig.deepLimits.perTool },
}

/**
 * Normalisasi dan penegakan batas sistem (Hard Ceiling Clamp)
 */
export function clampLimits(limits?: Partial<AgentLimits>, mode: AgentMode = "standard"): AgentLimits {
  const defaults = mode === "deep" ? DEFAULT_DEEP_LIMITS : DEFAULT_STANDARD_LIMITS
  const input = limits || {}

  const clamp = (val: number | undefined, min: number, max: number, fallback: number) => {
    if (typeof val !== "number" || isNaN(val)) return fallback
    return Math.max(min, Math.min(max, Math.round(val)))
  }

  const perTool: Record<string, number> = { ...defaults.perTool }
  if (input.perTool && typeof input.perTool === "object") {
    for (const [toolName, limitVal] of Object.entries(input.perTool)) {
      if (typeof limitVal === "number" && !isNaN(limitVal)) {
        perTool[toolName] = Math.max(1, Math.min(SYSTEM_LIMIT_BOUNDS.defaultPerToolLimit, Math.round(limitVal)))
      }
    }
  }

  return {
    maxModelCalls: clamp(input.maxModelCalls, SYSTEM_LIMIT_BOUNDS.minModelCalls, SYSTEM_LIMIT_BOUNDS.maxModelCalls, defaults.maxModelCalls),
    maxToolCalls: clamp(input.maxToolCalls, SYSTEM_LIMIT_BOUNDS.minToolCalls, SYSTEM_LIMIT_BOUNDS.maxToolCalls, defaults.maxToolCalls),
    timeoutSeconds: clamp(input.timeoutSeconds, SYSTEM_LIMIT_BOUNDS.minTimeoutSeconds, SYSTEM_LIMIT_BOUNDS.maxTimeoutSeconds, defaults.timeoutSeconds),
    minWordCount: clamp(input.minWordCount, SYSTEM_LIMIT_BOUNDS.minWordCount, SYSTEM_LIMIT_BOUNDS.maxWordCount, defaults.minWordCount),
    perTool,
  }
}

export interface AgentProfile {
  /** ID profil (jika tersimpan di database) */
  id?: string
  /** Identifier unik: format "preset:<preset-id>" untuk preset bawaan, atau UUID untuk user profile */
  ref: string
  name: string
  description?: string
  mode: AgentMode
  /** AI Model override, misal "openai/gpt-oss-120b". Kosong = ikuti setting global /settings/ai */
  model?: string
  modelName?: string
  temperature: number
  /** Prompt alur instruksi yang bebas ditentukan/diedit oleh user */
  workflowPrompt: string
  /** Daftar tool ID yang diizinkan untuk digunakan oleh agent */
  toolIds: string[]
  /** Daftar skill ID/slug untuk Deep Agent */
  skills?: string[]
  /** Batas komputasi eksekusi */
  limits: AgentLimits
  /** Apakah profile ini merupakan preset sistem bawaan (read-only base) */
  isPreset?: boolean
  /** Apakah profile ini merupakan default agent */
  isDefault?: boolean
  basedOnPreset?: string
  version: number
  userId?: string
  createdAt?: string
  updatedAt?: string
}

export const AgentProfileSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  mode: z.enum(["standard", "deep"]).default("standard"),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.35),
  workflowPrompt: z.string().min(10).max(12000),
  toolIds: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  limits: z.object({
    maxModelCalls: z.number().int().optional(),
    maxToolCalls: z.number().int().optional(),
    timeoutSeconds: z.number().int().optional(),
    minWordCount: z.number().int().optional(),
    perTool: z.record(z.string(), z.number().int()).optional(),
  }).optional(),
  basedOnPreset: z.string().optional(),
})

export type CreateAgentProfileDTO = z.infer<typeof AgentProfileSchema>
