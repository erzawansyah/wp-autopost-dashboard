import { LEGACY_ENGINE_MAP } from "@/core/writer/profiles"
import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { QuickPostBodySchema } from "@/lib/validation/posts"
import { OptionalTextSchema } from "@/lib/validation/queue"
import { nudgeQueueRunner } from "@/server/queue/embedded"
import { enqueueQuickPost } from "@/server/queue/enqueue"

/** Kompatibilitas klien lama: field legacy dipetakan ke Agent Profile bila `agentProfileRef` kosong. */
const QuickPostRouteBodySchema = QuickPostBodySchema.extend({ engine: OptionalTextSchema(50) })

// POST /api/posts/quick — Tulis Cepat: catat item `queued_input` lalu bangunkan runner antrean.
// Respons instan; kunci OpenRouter tidak pernah diterima dari browser (worker memakai BYOK tersimpan).
export const POST = defineRoute(
  { auth: "user", body: QuickPostRouteBodySchema, rateLimit: RATE_LIMITS.enqueue },
  async ({ supabase, user, body }) => {
    const legacyRef = body.engine && Object.hasOwn(LEGACY_ENGINE_MAP, body.engine) ? LEGACY_ENGINE_MAP[body.engine] : undefined
    const agentProfileRef = body.agentProfileRef || legacyRef || "preset:quick-writer"
    const categoryNames = body.category_names?.filter(Boolean).length
      ? body.category_names.filter(Boolean)
      : body.category
        ? [body.category]
        : []

    const { postId, siteName } = await enqueueQuickPost(supabase, user.id, {
      siteId: body.siteId,
      keyword: body.keyword,
      wpTargetStatus: body.actionStatus,
      customBrief: body.customBrief,
      categoryNames,
      tags: body.tags,
      aiConfig: {
        agentProfileRef,
        engine: body.engine ?? "quick",
        aiModel: body.aiModel,
        reasoningEffort: body.reasoningEffort,
        style: body.style ?? "default",
        language: body.language ?? "id",
        category_ids: body.category_ids,
      },
    })

    nudgeQueueRunner()

    return {
      postId,
      state: "queued_input",
      targetSite: siteName,
      message: "Artikel berhasil masuk ke antrean latar belakang dan akan segera diproses.",
    }
  }
)
