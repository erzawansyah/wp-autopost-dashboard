import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { ChangePasswordBodySchema } from "@/lib/validation/auth"
import { changePassword } from "@/server/services/auth"

// POST /api/auth/password — ganti kata sandi pengguna sesi: kata sandi lama diverifikasi dulu, lalu sesi lain dikeluarkan
export const POST = defineRoute(
  { auth: "user", body: ChangePasswordBodySchema, rateLimit: RATE_LIMITS.credentialChange },
  async ({ supabase, user, body }) => {
    const { otherSessionsSignedOut } = await changePassword(supabase, user, body)
    return {
      message: otherSessionsSignedOut
        ? "Kata sandi berhasil diganti. Sesi di perangkat lain telah dikeluarkan."
        : "Kata sandi berhasil diganti.",
    }
  }
)
