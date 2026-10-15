import { defineRoute } from "@/server/http/route"
import { badRequest } from "@/server/http/errors"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { AiTestBodySchema } from "@/server/validation/tools"
import { verifyOpenRouterKey } from "@/server/services/ai"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { MISSING_OPENROUTER_KEY_MESSAGE, sanitizeApiKey } from "@/lib/ai/platform-keys"

// POST /api/ai/test - Uji kunci OpenRouter (yang baru diketik, atau kunci BYOK tersimpan bila kosong/tersamar).
// Kunci platform sengaja tidak pernah diuji di sini agar label, limit, dan pemakaian akun operator tidak terekspos.
export const POST = defineRoute(
  { auth: "user", body: AiTestBodySchema, rateLimit: RATE_LIMITS.llm },
  async ({ user, body }) => {
    const apiKey = sanitizeApiKey(body.apiKey) ?? sanitizeApiKey((await getUserDecryptedKeys(user.id)).openrouterKey)
    if (!apiKey) throw badRequest(MISSING_OPENROUTER_KEY_MESSAGE)
    const summary = await verifyOpenRouterKey(apiKey)
    return { ...summary, message: "Koneksi ke OpenRouter API berhasil diverifikasi!" }
  }
)
