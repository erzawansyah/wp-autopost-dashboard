import { z } from "zod"

/**
 * Skema & helper murni modul skill (`agent_skills`, berkas SKILL.md) — dipakai bersama form client
 * (`/skills/new`, `/skills/[id]`) dan route API (`/api/skills/**`) serta service skill.
 */

/** Selaras CHECK `agent_skills_name_check` (2..120) & `agent_skills_slug_check` di migrasi baseline. */
export const SKILL_INPUT_BOUNDS = {
  nameMin: 2,
  nameMax: 120,
  slugMax: 100,
  descriptionMax: 1000,
  contentMax: 100_000,
} as const

const SKILL_SLUG_PATTERN = /^[a-z0-9_-]+$/
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/

/** Ambil `name`/`description` dari YAML frontmatter SKILL.md (`---\nname: ...\n---`). */
export function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(FRONTMATTER_PATTERN)
  if (!match) return {}
  const result: { name?: string; description?: string } = {}

  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key === "name") result.name = value
    if (key === "description") result.description = value
  }
  return result
}

/** Normalisasi slug ke pola CHECK `^[a-z0-9_-]+$`; kosong → `custom-skill`. */
export function normalizeSkillSlug(raw: string): string {
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SKILL_INPUT_BOUNDS.slugMax)
    .replace(/-$/, "")
  return slug || "custom-skill"
}

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

/** Nama efektif skill baru: isian `name`, atau `name` di frontmatter SKILL.md bila kosong. */
export function resolveSkillName(name: string | undefined, content: string): string {
  return name || parseSkillFrontmatter(content).name || ""
}

/**
 * Form `/skills/new`: body yang sama dengan POST, plus nama efektif (isian atau frontmatter) wajib
 * valid di sisi client — sama dengan aturan service sehingga pengguna tidak perlu menunggu 400.
 */
export const CreateSkillFormSchema = CreateSkillBodySchema.superRefine((value, ctx) => {
  const result = SkillNameSchema.safeParse(resolveSkillName(value.name, value.content))
  if (!result.success) {
    ctx.addIssue({
      code: "custom",
      path: ["name"],
      message: `${result.error.issues[0]?.message ?? "Nama skill tidak valid."} Isi nama atau tulis 'name: ...' di frontmatter.`,
    })
  }
})

/** PUT /api/skills/[id]: pembaruan parsial; slug tidak dapat diubah. Juga skema form `/skills/[id]`. */
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
