import { z } from "zod"
import { ToolRegistry } from "@/core/writer/tools"
import {
  AGENT_PROFILE_INPUT_BOUNDS as B,
  AgentLimitsInputSchema,
  AgentModeSchema,
  ensureMandatoryToolIds,
} from "@/core/writer/types/profile"
import { UuidSchema } from "./common"
import { SkillSlugSchema } from "./skills"

/** Validasi input Agent Profile kustom (`agent_profiles`). Rentang batas eksekusi tetap lewat `clampLimits()`. */

const PRESET_REF_PATTERN = /^preset:[a-z0-9-]{1,64}$/

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Params `[id]`: UUID Agent Profile milik pengguna atau ref profil bawaan `preset:*`. */
export const AgentRefParamsSchema = z.object({
  id: z
    .string({ error: "ID Agent Profile tidak valid." })
    .transform(safeDecode)
    .refine((value) => PRESET_REF_PATTERN.test(value) || UuidSchema.safeParse(value).success, {
      message: "ID Agent Profile tidak valid.",
    }),
})

export function isPresetRef(ref: string): boolean {
  return ref.startsWith("preset:")
}

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

/** Hanya tool yang terdaftar di ToolRegistry; duplikat dibuang. */
const ToolIdsSchema = z
  .array(
    z.string({ error: "ID tool harus berupa teks." }).trim().refine((id) => ToolRegistry.has(id), {
      message: "Tool tidak dikenal. Pilih tool dari daftar yang tersedia.",
    }),
    { error: "Daftar tool (toolIds) harus berupa array." }
  )
  .max(B.maxToolIds, `Maksimal ${B.maxToolIds} tool per Agent Profile.`)
  .transform((ids) => ensureMandatoryToolIds(ids))

const SkillsSchema = z
  .array(SkillSlugSchema, { error: "Daftar skill harus berupa array slug." })
  .max(B.maxSkills, `Maksimal ${B.maxSkills} skill per Agent Profile.`)
  .transform((slugs) => Array.from(new Set(slugs)))

const IsDefaultSchema = z.boolean({ error: "isDefault harus berupa boolean." })

/** POST /api/agents. */
export const CreateAgentProfileBodySchema = z.object(
  {
    name: NameSchema,
    description: DescriptionSchema,
    mode: AgentModeSchema.default("standard"),
    modelName: ModelNameSchema,
    temperature: TemperatureSchema.default(0.95),
    workflowPrompt: WorkflowPromptSchema,
    toolIds: ToolIdsSchema.default([]),
    skills: SkillsSchema.default([]),
    limits: AgentLimitsInputSchema.nullish(),
    isDefault: IsDefaultSchema.default(false),
  },
  { error: "Body permintaan harus berupa objek JSON." }
)

export type CreateAgentProfileInput = z.infer<typeof CreateAgentProfileBodySchema>

/**
 * PUT /api/agents/[id]: pembaruan parsial. `limits: null` → kembali ke default mode;
 * `limits` tidak dikirim → batas tersimpan dipertahankan.
 */
export const UpdateAgentProfileBodySchema = z
  .object(
    {
      name: NameSchema.optional(),
      description: DescriptionSchema,
      mode: AgentModeSchema.optional(),
      modelName: ModelNameSchema,
      temperature: TemperatureSchema.optional(),
      workflowPrompt: WorkflowPromptSchema.optional(),
      toolIds: ToolIdsSchema.optional(),
      skills: SkillsSchema.optional(),
      limits: AgentLimitsInputSchema.nullish(),
      isDefault: IsDefaultSchema.optional(),
    },
    { error: "Body permintaan harus berupa objek JSON." }
  )
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Tidak ada perubahan yang dikirim.",
  })

export type UpdateAgentProfileInput = z.infer<typeof UpdateAgentProfileBodySchema>

/** GET /api/agents/tools. */
export const AgentToolsQuerySchema = z.object({
  siteId: UuidSchema.optional(),
})
