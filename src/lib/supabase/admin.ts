import "server-only"
import { createClient } from "@supabase/supabase-js"
import { serverEnv } from "@/lib/env/server"

/**
 * Supabase Admin Client (Service Role)
 * PENTING: Hanya boleh dipanggil di lingkungan server-side terotorisasi.
 * Wajib selalu sertakan filter user_id eksplisit saat melakukan mutasi data.
 */
export function createAdminClient() {
  const env = serverEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.supabaseServiceRoleKey

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL belum disetel di environment variables.")
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY (atau alias SUPABASE_SERVICE_ROLE_KEY) belum disetel di environment variables."
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
