import { z } from "zod"

/** Validasi input modul skill (`agent_skills`, berkas SKILL.md). */

/** Selaras CHECK `agent_skills_name_check` (2..120) & `agent_skills_slug_check` di migrasi baseline. */
export const SKILL_INPUT_BOUNDS = {
  nameMin: 2,
  nameMax: 120,
  slugMax: 100,
  descriptionMax: 1000,
  contentMax: 100_000,
} as const

const SKILL_SLUG_PATTERN = /^[a-z0-9_-]+$/

/** Slug skill yang sudah ternormalisasi (dipakai juga oleh daftar skill di Agent Profile). */
export const SkillSlugSchema = z
  .string({ error: "Slug skill harus berupa teks." })
  .trim()
  .min(1, "Slug skill tidak boleh kosong.")
  .max(SKILL_INPUT_BOUNDS.slugMax, `Slug skill maksimal ${SKILL_INPUT_BOUNDS.slugMax} karakter.`)
  .regex(SKILL_SLUG_PATTERN, "Slug skill hanya boleh berisi huruf kecil, angka, '-' dan '_'.")

export const SkillNameSchema = z
  .string({ error: "Nama skill harus berupa teks." })
  .trim()
  .min(SKILL_INPUT_BOUNDS.nameMin, `Nama skill minimal ${SKILL_INPUT_BOUNDS.nameMin} karakter.`)
  .max(SKILL_INPUT_BOUNDS.nameMax, `Nama skill maksimal ${SKILL_INPUT_BOUNDS.nameMax} karakter.`)

const SkillDescriptionSchema = z
  .string({ error: "Deskripsi skill harus berupa teks." })
  .trim()
  .max(SKILL_INPUT_BOUNDS.descriptionMax, `Deskripsi skill maksimal ${SKILL_INPUT_BOUNDS.descriptionMax} karakter.`)
  .nullish()

const SkillContentSchema = z
  .string({ error: "Konten file SKILL.md wajib diisi." })
  .trim()
  .min(1, "Konten file SKILL.md wajib diisi.")
  .max(SKILL_INPUT_BOUNDS.contentMax, `Konten SKILL.md maksimal ${SKILL_INPUT_BOUNDS.contentMax} karakter.`)

/**
 * POST /api/skills. `name`/`description` boleh kosong bila tersedia di YAML frontmatter `content`
 * (batas nama ditegakkan service setelah fallback). `slug` mentah dinormalisasi oleh service.
 */
export const CreateSkillBodySchema = z.object(
  {
    name: z
      .string({ error: "Nama skill harus berupa teks." })
      .trim()
      .max(SKILL_INPUT_BOUNDS.nameMax, `Nama skill maksimal ${SKILL_INPUT_BOUNDS.nameMax} karakter.`)
      .optional(),
    slug: z.string({ error: "Slug skill harus berupa teks." }).trim().max(200, "Slug skill terlalu panjang.").optional(),
    description: SkillDescriptionSchema,
    content: SkillContentSchema,
  },
  { error: "Body permintaan harus berupa objek JSON." }
)

export type CreateSkillInput = z.infer<typeof CreateSkillBodySchema>

/** PUT /api/skills/[id]: pembaruan parsial; slug tidak dapat diubah. */
export const UpdateSkillBodySchema = z
  .object(
    {
      name: SkillNameSchema.optional(),
      description: SkillDescriptionSchema,
      content: SkillContentSchema.optional(),
    },
    { error: "Body permintaan harus berupa objek JSON." }
  )
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Tidak ada perubahan yang dikirim.",
  })

export type UpdateSkillInput = z.infer<typeof UpdateSkillBodySchema>
