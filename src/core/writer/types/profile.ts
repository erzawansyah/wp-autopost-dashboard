import { z } from "zod"
import settingsConfig from "@/core/shared/settings.json"

export const AgentModeSchema = z.enum(["standard", "deep"], {
  error: "Mode agen harus 'standard' atau 'deep'.",
})

export type AgentMode = z.infer<typeof AgentModeSchema>

/**
 * Batas input Agent Profile kustom. `nameMin/nameMax` dan `workflowPromptMax` selaras dengan CHECK
 * `agent_profiles_name_check` & `agent_profiles_workflow_prompt_check` di migrasi baseline; sisanya
 * batas API. Dipakai validasi server (`src/server/validation/agents.ts`) dan editor di browser.
 */
export const AGENT_PROFILE_INPUT_BOUNDS = {
  nameMin: 2,
  nameMax: 100,
  descriptionMax: 1000,
  workflowPromptMax: 12_000,
  modelNameMax: 200,
  temperatureMin: 0,
  temperatureMax: 2,
  maxToolIds: 20,
  maxSkills: 20,
} as const

/**
 * Penanda profil default disimpan di dalam JSONB `agent_profiles.limits.isDefault`
 * (tabel tidak punya kolom `is_default`). Nilai selain `true` dianggap bukan default.
 */
export function readStoredIsDefault(rawLimits: unknown): boolean {
  if (typeof rawLimits !== "object" || rawLimits === null || Array.isArray(rawLimits)) return false
  return (rawLimits as Record<string, unknown>).isDefault === true
}

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
 * Skema input `limits` dari body API (validasi ketat untuk input pengguna).
 * Hanya memvalidasi bentuk & tipe; penegakan rentang tetap wajib lewat `clampLimits()`.
 * Kunci tak dikenal di level atas (mis. `isDefault`) dibuang, tetapi kuota per-tool untuk tool
 * yang tidak dikenal ditolak. Untuk baris tersimpan gunakan `parseStoredAgentLimits()`.
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

const LIMIT_NUMBER_KEYS = ["maxModelCalls", "maxToolCalls", "timeoutSeconds", "minWordCount"] as const

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * Parser longgar untuk `agent_profiles.limits` yang SUDAH tersimpan (JSONB). Baris lama dapat memuat
 * kuota `perTool` untuk tool yang sudah dihapus (mis. `list_wp_tags`) atau kunci lain (`isDefault`);
 * validasi ketat akan gagal dan membuat batas tersimpan diam-diam kembali ke default. Di sini nilai
 * yang tidak dikenal/tidak valid cukup dibuang per kunci. Hasilnya tetap wajib lewat `clampLimits()`.
 */
export function parseStoredAgentLimits(raw: unknown): Partial<AgentLimits> | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined
  const source = raw as Record<string, unknown>

  const parsed: Partial<AgentLimits> = {}
  for (const key of LIMIT_NUMBER_KEYS) {
    const value = source[key]
    if (isFiniteNumber(value)) parsed[key] = value
  }

  const rawPerTool = source.perTool
  if (typeof rawPerTool === "object" && rawPerTool !== null && !Array.isArray(rawPerTool)) {
    const perTool: Record<string, number> = {}
    for (const [toolId, value] of Object.entries(rawPerTool)) {
      if (PER_TOOL_QUOTA_IDS.includes(toolId) && isFiniteNumber(value)) perTool[toolId] = value
    }
    if (Object.keys(perTool).length > 0) parsed.perTool = perTool
  }

  return parsed
}

/** Batas efektif untuk baris `agent_profiles` tersimpan: parse longgar + clamp sesuai mode baris. */
export function resolveStoredAgentLimits(raw: unknown, mode: unknown): AgentLimits {
  return clampLimits(parseStoredAgentLimits(raw), mode === "deep" ? "deep" : "standard")
}

/**
 * Normalisasi dan penegakan batas sistem (Hard Ceiling Clamp).
 * Kuota per-tool hanya untuk tool yang punya kuota bawaan; kunci tool lain (mis. tool lama) dibuang.
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
      if (!PER_TOOL_QUOTA_IDS.includes(toolName)) continue
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
  /**
   * Model pilihan eksplisit Agent Profile kustom, misal "openai/gpt-4o-mini" — mengalahkan model default akun.
   * Kosong = ikuti model default akun (Pengaturan › Kunci API & Model AI). Preset bawaan tidak pernah mengalahkan
   * default akun (`runtime/resolve-model.ts`).
   */
  model?: string
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
