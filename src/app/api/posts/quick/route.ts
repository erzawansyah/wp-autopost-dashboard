import { z } from "zod"
import { LEGACY_ENGINE_MAP } from "@/core/writer/profiles"
import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { UuidSchema } from "@/lib/validation/common"
import { nudgeQueueRunner } from "@/server/queue/embedded"
import { enqueueQuickPost } from "@/server/queue/enqueue"
import { CategoryIdListSchema, OptionalTextSchema, ReasoningEffortSchema, TagListSchema } from "@/server/queue/schemas"

const QuickPostBodySchema = z.object({
  siteId: UuidSchema,
  keyword: z.string().trim().min(1, "Kata kunci wajib diisi.").max(300),
  category: OptionalTextSchema(200),
  category_ids: CategoryIdListSchema,
  category_names: z.array(z.string().trim().max(200)).max(50).optional(),
  tags: TagListSchema,
  customBrief: OptionalTextSchema(10_000),
  actionStatus: z.enum(["draft", "publish", "future"]).default("draft"),
  aiModel: OptionalTextSchema(200),
  reasoningEffort: ReasoningEffortSchema,
  agentProfileRef: OptionalTextSchema(200),
  engine: OptionalTextSchema(50),
  style: OptionalTextSchema(50),
  language: OptionalTextSchema(10),
})

// POST /api/posts/quick — Tulis Cepat: catat item `queued_input` lalu bangunkan runner antrean.
// Respons instan; kunci OpenRouter tidak pernah diterima dari browser (worker memakai BYOK tersimpan).
export const POST = defineRoute(
  { auth: "user", body: QuickPostBodySchema, rateLimit: RATE_LIMITS.enqueue },
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
