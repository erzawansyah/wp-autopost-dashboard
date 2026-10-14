import { z } from "zod"
import settingsConfig from "@/core/shared/settings.json"

export const AgentModeSchema = z.enum(["standard", "deep"], {
  error: "Mode agen harus 'standard' atau 'deep'.",
})

export type AgentMode = z.infer<typeof AgentModeSchema>

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
 * Catatan: Taksonomi, Author, dan Media kini ditangani otomatis oleh sistem via Pre-Flight & Post-Flight pipeline,
 * sehingga Agent tidak lagi dipaksa memegang tool-tool ini saat proses penulisan naskah.
 */
export const MANDATORY_TOOL_IDS = [] as const
export const MANDATORY_TOOL_ALIASES = [] as const
export const ALL_MANDATORY_TOOL_IDS = [] as const

export function ensureMandatoryToolIds(toolIds: string[] = []): string[] {
  const safeList = Array.isArray(toolIds) ? toolIds : []
  return Array.from(new Set(safeList))
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

/** Tool yang punya kuota bawaan di settings.json; hanya kunci ini yang boleh di-override lewat `limits.perTool`. */
const PER_TOOL_QUOTA_IDS: readonly string[] = Array.from(
  new Set([...Object.keys(DEFAULT_STANDARD_LIMITS.perTool), ...Object.keys(DEFAULT_DEEP_LIMITS.perTool)])
)

/** `null` (mis. input angka kosong → NaN → JSON `null`) diperlakukan sama dengan tidak diisi → nilai default mode. */
const limitValueSchema = z
  .number({ error: "Setiap nilai batas eksekusi (limits) harus berupa angka." })
  .nullish()
  .transform((value) => value ?? undefined)

/**
 * Skema input `limits` dari body API (dan dari kolom JSONB tersimpan).
 * Hanya memvalidasi bentuk & tipe; penegakan rentang tetap wajib lewat `clampLimits()`.
 * Kunci tak dikenal (mis. `isDefault` yang ikut tersimpan di JSONB) dibuang.
 */
export const AgentLimitsInputSchema = z.object(
  {
    maxModelCalls: limitValueSchema,
    maxToolCalls: limitValueSchema,
    timeoutSeconds: limitValueSchema,
    minWordCount: limitValueSchema,
    perTool: z
      .record(
        z.string().refine((toolId) => PER_TOOL_QUOTA_IDS.includes(toolId)),
        z.number({ error: "Kuota per-tool harus berupa angka." }),
        {
          error: (issue) =>
            issue.code === "invalid_key"
              ? `Kuota per-tool hanya berlaku untuk tool: ${PER_TOOL_QUOTA_IDS.join(", ")}.`
              : "Kuota per-tool (perTool) harus berupa objek.",
        }
      )
      .nullish()
      .transform((value) => value ?? undefined),
  },
  { error: "Batas eksekusi (limits) harus berupa objek." }
)

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
  /** Level penalaran OpenRouter: 'low' | 'medium' | 'high' */
  reasoningEffort?: "low" | "medium" | "high"
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
