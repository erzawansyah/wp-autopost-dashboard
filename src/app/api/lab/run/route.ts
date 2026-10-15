import { z } from "zod"
import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { UuidSchema } from "@/server/validation/common"
import { assertLabAccess, runLabAgentProfile, runLabTool } from "@/server/services/lab"

const TargetIdSchema = z.string().trim().min(1).max(100)
const LabParamsSchema = z.record(z.string().max(100), z.unknown())

/**
 * Body uji Lab. `type`: "tool" atau Agent Profile ("agent"; nilai lama dari UI Lab masih diterima).
 * API key TIDAK diterima dari body: Lab hanya memakai kunci BYOK tersimpan milik pengguna.
 */
const LabRunBodySchema = z
  .object(
    {
      type: z.enum(["tool", "agent", "engine"], { error: "Tipe pengujian harus 'tool' atau 'agent'." }),
      targetId: TargetIdSchema.optional(),
      id: TargetIdSchema.optional(),
      siteId: UuidSchema.optional(),
      model: z.string().trim().max(200).optional(),
      params: LabParamsSchema.optional(),
      input: LabParamsSchema.optional(),
    },
    { error: "Body permintaan harus berupa objek JSON." }
  )
  .refine((body) => Boolean(body.targetId || body.id), {
    message: "Parameter type dan targetId/id wajib disertakan.",
    path: ["targetId"],
  })

// POST /api/lab/run - Uji tool atau Agent Profile di Laboratorium. Wajib Developer Mode.
// Hasil gagal tetap HTTP 200 dengan `ok: false` agar UI dapat menampilkan hasil parsial & log.
export const POST = defineRoute(
  { auth: "user", body: LabRunBodySchema, rateLimit: RATE_LIMITS.llm },
  async ({ supabase, user, body }) => {
    await assertLabAccess(supabase, user)
    const request = {
      targetId: body.targetId || body.id || "",
      siteId: body.siteId,
      model: body.model,
      input: body.params ?? body.input ?? {},
    }
    const result =
      body.type === "tool"
        ? await runLabTool(supabase, user.id, request)
        : await runLabAgentProfile(supabase, user.id, request)
    return Response.json(result)
  }
)
