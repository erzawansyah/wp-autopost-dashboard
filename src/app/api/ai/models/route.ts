import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { AiModelsQuerySchema } from "@/server/validation/tools"
import { listOpenRouterModels } from "@/server/services/ai"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { sanitizeApiKey } from "@/lib/ai/platform-keys"
import { UNSAVED_OPENROUTER_KEY_HEADER } from "@/lib/ai/settings"

// GET /api/ai/models?toolsOnly=false - Katalog model OpenRouter (default: hanya model dengan tool calling).
// Kunci yang belum disimpan hanya diterima lewat header `x-openrouter-key` (tidak tercatat di log URL);
// selain itu kunci BYOK pengguna. Kunci platform tidak dipakai: katalog OpenRouter publik tetap bisa dimuat tanpa kunci.
export const GET = defineRoute(
  { auth: "user", query: AiModelsQuerySchema, rateLimit: RATE_LIMITS.outboundTest },
  async ({ request, user, query }) => {
    const apiKey =
      sanitizeApiKey(request.headers.get(UNSAVED_OPENROUTER_KEY_HEADER)) ??
      sanitizeApiKey((await getUserDecryptedKeys(user.id)).openrouterKey)
    const models = await listOpenRouterModels(apiKey, query.toolsOnly)
    return { count: models.length, toolsOnly: query.toolsOnly, models }
  }
)
