import { z } from "zod"
import {
  AGENT_PROFILE_INPUT_BOUNDS as B,
  AgentLimitsInputSchema,
  AgentModeSchema,
  DEFAULT_DEEP_LIMITS,
  DEFAULT_STANDARD_LIMITS,
  SYSTEM_LIMIT_BOUNDS,
  clampLimits,
  ensureMandatoryToolIds,
  type AgentMode,
} from "@/core/writer/types/profile"
import { UuidSchema } from "./common"
import { SkillSlugSchema } from "./skills"

/**
 * Skema & helper murni Agent Profile kustom (`agent_profiles`) — dipakai bersama editor client
 * (`/agents/new`, `/agents/[id]`) dan route API `/api/agents/**`. Batas & default berasal dari
 * `@/core/writer/types/profile` (modul murni: zod + `settings.json`, sumber tunggal yang juga dipakai
 * runtime). Validasi `toolIds` terhadap ToolRegistry hanya di server (`src/server/validation/agents.ts`);
 * rentang batas eksekusi tetap ditegakkan `clampLimits()` di service.
 */

// ---------------------------------------------------------------------------
// Ref Agent Profile (UUID kustom atau `preset:*` bawaan)
// ---------------------------------------------------------------------------

const PRESET_REF_PATTERN = /^preset:[a-z0-9-]{1,64}$/

export function isPresetRef(ref: string): boolean {
  return ref.startsWith("preset:")
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Params `[id]`: UUID Agent Profile milik pengguna atau ref profil bawaan `preset:*` (boleh ter-encode). */
export const AgentRefParamsSchema = z.object({
  id: z
    .string({ error: "ID Agent Profile tidak valid." })
    .transform(safeDecode)
    .refine((value) => PRESET_REF_PATTERN.test(value) || UuidSchema.safeParse(value).success, {
      message: "ID Agent Profile tidak valid.",
    }),
})

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

/** Temperatur bawaan Agent Profile baru (selaras `ai.agentTemperature` di settings.json). */
export const DEFAULT_AGENT_TEMPERATURE = 0.95

const NameSchema = z
  .string({ error: "Nama profil agen wajib diisi." })
  .trim()
  .min(B.nameMin, `Nama profil agen minimal ${B.nameMin} karakter.`)
  .max(B.nameMax, `Nama profil agen maksimal ${B.nameMax} karakter.`)

const DescriptionSchema = z
  .string({ error: "Deskripsi harus berupa teks." })
  .trim()
  .max(B.descriptionMax, `Deskripsi maksimal ${B.descriptionMax} karakter.`)
  .nullish()

const ModelNameSchema = z
  .string({ error: "Nama model harus berupa teks." })
  .trim()
  .max(B.modelNameMax, `Nama model maksimal ${B.modelNameMax} karakter.`)
  .nullish()

const TemperatureSchema = z
  .number({ error: "Temperatur harus berupa angka." })
  .min(B.temperatureMin, `Temperatur minimal ${B.temperatureMin}.`)
  .max(B.temperatureMax, `Temperatur maksimal ${B.temperatureMax}.`)

const WorkflowPromptSchema = z
  .string({ error: "Workflow prompt wajib diisi." })
  .trim()
  .min(1, "Workflow prompt wajib diisi.")
  .max(B.workflowPromptMax, `Workflow prompt maksimal ${B.workflowPromptMax} karakter.`)

const BaseToolIdSchema = z.string({ error: "ID tool harus berupa teks." }).trim()

/** Daftar tool (duplikat dibuang). Server mengganti `idSchema` dengan versi yang memeriksa ToolRegistry. */
export function agentToolIdsSchema(idSchema: z.ZodType<string, string> = BaseToolIdSchema) {
  return z
    .array(idSchema, { error: "Daftar tool (toolIds) harus berupa array." })
    .max(B.maxToolIds, `Maksimal ${B.maxToolIds} tool per Agent Profile.`)
    .transform((ids) => ensureMandatoryToolIds(ids))
}

const SkillsSchema = z
  .array(SkillSlugSchema, { error: "Daftar skill harus berupa array slug." })
  .max(B.maxSkills, `Maksimal ${B.maxSkills} skill per Agent Profile.`)
  .transform((slugs) => Array.from(new Set(slugs)))

const IsDefaultSchema = z.boolean({ error: "isDefault harus berupa boolean." })

// ---------------------------------------------------------------------------
// Body API (bentuk dasar; server menambah pemeriksaan ToolRegistry)
// ---------------------------------------------------------------------------

/** POST /api/agents — tanpa pemeriksaan ToolRegistry (lihat `src/server/validation/agents.ts`). */
export const CreateAgentProfileBodyBaseSchema = z.object(
  {
    name: NameSchema,
    description: DescriptionSchema,
    mode: AgentModeSchema.default("standard"),
    modelName: ModelNameSchema,
    temperature: TemperatureSchema.default(DEFAULT_AGENT_TEMPERATURE),
    workflowPrompt: WorkflowPromptSchema,
    toolIds: agentToolIdsSchema().default([]),
    skills: SkillsSchema.default([]),
    limits: AgentLimitsInputSchema.nullish(),
    isDefault: IsDefaultSchema.default(false),
  },
  { error: "Body permintaan harus berupa objek JSON." }
)

/**
 * PUT /api/agents/[id] — pembaruan parsial (bentuk dasar, tanpa refinement agar dapat di-`.extend()`).
 * `limits: null` → kembali ke default mode; `limits` tidak dikirim → batas tersimpan dipertahankan.
 */
export const UpdateAgentProfileBodyBaseSchema = z.object(
  {
    name: NameSchema.optional(),
    description: DescriptionSchema,
    mode: AgentModeSchema.optional(),
    modelName: ModelNameSchema,
    temperature: TemperatureSchema.optional(),
    workflowPrompt: WorkflowPromptSchema.optional(),
    toolIds: agentToolIdsSchema().optional(),
    skills: SkillsSchema.optional(),
    limits: AgentLimitsInputSchema.nullish(),
    isDefault: IsDefaultSchema.optional(),
  },
  { error: "Body permintaan harus berupa objek JSON." }
)

/** Refinement PUT: minimal satu field dikirim. */
export const hasAgentProfileChanges = (body: Record<string, unknown>): boolean =>
  Object.values(body).some((value) => value !== undefined)

export const NO_AGENT_PROFILE_CHANGES_MESSAGE = "Tidak ada perubahan yang dikirim."

// ---------------------------------------------------------------------------
// Batas eksekusi di editor (rentang = SYSTEM_LIMIT_BOUNDS, dijepit seperti clampLimits() di server)
// ---------------------------------------------------------------------------

export const AGENT_LIMIT_KEYS = ["maxModelCalls", "maxToolCalls", "timeoutSeconds", "minWordCount"] as const
export type AgentLimitKey = (typeof AGENT_LIMIT_KEYS)[number]

/** Rentang yang diterapkan `clampLimits()` per kunci (untuk atribut min/max & petunjuk di form). */
export const AGENT_LIMIT_RANGES: Record<AgentLimitKey, { min: number; max: number }> = {
  maxModelCalls: { min: SYSTEM_LIMIT_BOUNDS.minModelCalls, max: SYSTEM_LIMIT_BOUNDS.maxModelCalls },
  maxToolCalls: { min: SYSTEM_LIMIT_BOUNDS.minToolCalls, max: SYSTEM_LIMIT_BOUNDS.maxToolCalls },
  timeoutSeconds: { min: SYSTEM_LIMIT_BOUNDS.minTimeoutSeconds, max: SYSTEM_LIMIT_BOUNDS.maxTimeoutSeconds },
  minWordCount: { min: SYSTEM_LIMIT_BOUNDS.minWordCount, max: SYSTEM_LIMIT_BOUNDS.maxWordCount },
}

export type AgentLimitsFormValues = Record<AgentLimitKey, number>

/** Empat batas yang dapat diubah di editor (tanpa kuota per-tool) untuk satu mode. */
export function defaultAgentLimits(mode: AgentMode): AgentLimitsFormValues {
  const defaults = mode === "deep" ? DEFAULT_DEEP_LIMITS : DEFAULT_STANDARD_LIMITS
  return {
    maxModelCalls: defaults.maxModelCalls,
    maxToolCalls: defaults.maxToolCalls,
    timeoutSeconds: defaults.timeoutSeconds,
    minWordCount: defaults.minWordCount,
  }
}

/** Nilai efektif satu batas setelah dijepit server (`clampLimits`); input kosong/NaN → default mode. */
export function clampAgentLimit(key: AgentLimitKey, value: number, mode: AgentMode): number {
  return clampLimits({ [key]: value }, mode)[key]
}

const LimitValueSchema = z.number({ error: "Isi dengan angka." })

const AgentLimitsFormSchema = z.object({
  maxModelCalls: LimitValueSchema,
  maxToolCalls: LimitValueSchema,
  timeoutSeconds: LimitValueSchema,
  minWordCount: LimitValueSchema,
})

// ---------------------------------------------------------------------------
// Form editor Agent Profile
// ---------------------------------------------------------------------------

/**
 * Form `/agents/new` & `/agents/[id]`. Keluarannya dikirim apa adanya sebagai body POST/PUT (field sama);
 * server tetap memvalidasi tool terhadap ToolRegistry dan menjepit `limits`.
 */
export const AgentProfileFormSchema = z.object({
  name: NameSchema,
  description: z
    .string({ error: "Deskripsi harus berupa teks." })
    .trim()
    .max(B.descriptionMax, `Deskripsi maksimal ${B.descriptionMax} karakter.`),
  mode: AgentModeSchema,
  temperature: TemperatureSchema,
  workflowPrompt: WorkflowPromptSchema,
  toolIds: agentToolIdsSchema(),
  skills: SkillsSchema,
  limits: AgentLimitsFormSchema,
  isDefault: IsDefaultSchema,
})

export type AgentProfileFormValues = z.input<typeof AgentProfileFormSchema>
export type AgentProfileFormOutput = z.output<typeof AgentProfileFormSchema>

/** Sumber nilai awal editor: profil bawaan/kustom dari `GET /api/agents/[id]` atau service. */
export interface AgentProfileFormSource {
  name: string
  description?: string | null
  mode: string
  temperature: number
  workflowPrompt: string
  toolIds: string[]
  skills?: string[]
  limits?: Partial<Record<AgentLimitKey, number>>
  isDefault?: boolean
}

const NEW_PROFILE_TOOL_IDS = ["keyword_suggestions", "web_search", "image_search"]
const NEW_PROFILE_SKILLS = ["anti-ai-editor"]
const CLONE_SUFFIX = " (Salinan)"

function toMode(value: string): AgentMode {
  return value === "deep" ? "deep" : "standard"
}

/** Nilai awal editor untuk profil baru (workflow prompt dari template bawaan). */
export function newAgentProfileFormValues(workflowPrompt: string): AgentProfileFormValues {
  return {
    name: "",
    description: "",
    mode: "standard",
    temperature: DEFAULT_AGENT_TEMPERATURE,
    workflowPrompt,
    toolIds: [...NEW_PROFILE_TOOL_IDS],
    skills: [...NEW_PROFILE_SKILLS],
    limits: defaultAgentLimits("standard"),
    isDefault: false,
  }
}

/** Nilai awal editor dari profil tersimpan; `clone` → nama "(Salinan)" & bukan default. */
export function agentProfileFormValues(source: AgentProfileFormSource, { clone = false } = {}): AgentProfileFormValues {
  const mode = toMode(source.mode)
  const defaults = defaultAgentLimits(mode)
  const limits = Object.fromEntries(
    AGENT_LIMIT_KEYS.map((key) => [key, source.limits?.[key] ?? defaults[key]])
  ) as AgentLimitsFormValues
  const name = clone ? `${source.name.slice(0, B.nameMax - CLONE_SUFFIX.length)}${CLONE_SUFFIX}` : source.name

  return {
    name,
    description: source.description ?? "",
    mode,
    temperature: source.temperature,
    workflowPrompt: source.workflowPrompt,
    toolIds: [...source.toolIds],
    // Preset standard tanpa daftar skill → skill bawaan profil baru (terpakai bila diubah ke mode deep).
    skills: [...(source.skills ?? NEW_PROFILE_SKILLS)],
    limits,
    isDefault: clone ? false : Boolean(source.isDefault),
  }
}

function sameLimits(a: AgentLimitsFormValues, b: AgentLimitsFormValues): boolean {
  return AGENT_LIMIT_KEYS.every((key) => a[key] === b[key])
}

/**
 * Batas saat mode diganti: bila batas masih persis default mode lama (belum disesuaikan), ikut pindah ke
 * default mode baru; batas yang sudah disesuaikan pengguna dipertahankan.
 */
export function limitsForModeChange(
  current: AgentLimitsFormValues,
  from: AgentMode,
  to: AgentMode
): AgentLimitsFormValues {
  if (from === to || !sameLimits(current, defaultAgentLimits(from))) return current
  return defaultAgentLimits(to)
}

/** Body POST/PUT dari keluaran form: batas dijepit persis seperti `clampLimits()` di server. */
export function toAgentProfileBody(values: AgentProfileFormOutput): AgentProfileFormOutput {
  const limits = Object.fromEntries(
    AGENT_LIMIT_KEYS.map((key) => [key, clampAgentLimit(key, values.limits[key], values.mode)])
  ) as AgentLimitsFormValues
  return { ...values, limits }
}
