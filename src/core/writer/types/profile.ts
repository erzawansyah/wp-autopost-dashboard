import { z } from "zod"
import { DecryptedUserKeys } from "@/types/settings"

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
  minModelCalls: 3,
  maxModelCalls: 35,
  minToolCalls: 0,
  maxToolCalls: 50,
  minTimeoutSeconds: 30,
  maxTimeoutSeconds: 480,
  minWordCount: 300,
  maxWordCount: 5000,
  defaultPerToolLimit: 10,
}

export const DEFAULT_STANDARD_LIMITS: AgentLimits = {
  maxModelCalls: 12,
  maxToolCalls: 15,
  timeoutSeconds: 240,
  minWordCount: 600,
  perTool: {
    web_search: 6,
    web_reader: 4,
    image_search: 4,
    upload_media: 4,
    list_wp_categories: 2,
    list_wp_tags: 2,
    list_wp_authors: 2,
  },
}

export const DEFAULT_DEEP_LIMITS: AgentLimits = {
  maxModelCalls: 22,
  maxToolCalls: 28,
  timeoutSeconds: 360,
  minWordCount: 800,
  perTool: {
    web_search: 8,
    web_reader: 6,
    image_search: 5,
    upload_media: 5,
    list_wp_categories: 2,
    list_wp_tags: 2,
    list_wp_authors: 2,
  },
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
