import { defineRoute } from "@/server/http/route"
import { getUserSettings, updateUserSettings } from "@/server/services/settings"
import { UpdateUserSettingsBodySchema } from "@/server/validation/settings"

// GET /api/settings/user — status kunci BYOK (tersamar) & preferensi pengguna; nilai kunci tidak pernah dikirim
export const GET = defineRoute({ auth: "user" }, async ({ supabase, user }) => getUserSettings(supabase, user.id))

// PUT /api/settings/user — simpan kunci BYOK (AES-256-GCM) & preferensi; hanya field yang dikirim yang berubah
export const PUT = defineRoute(
  { auth: "user", body: UpdateUserSettingsBodySchema },
  async ({ supabase, user, body }) => {
    await updateUserSettings(supabase, user.id, body)
    return { message: "Pengaturan dan kunci API BYOK berhasil disimpan dengan aman." }
  }
)
