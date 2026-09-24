import { createClient } from "@supabase/supabase-js"

/**
 * Supabase Admin Client (Service Role)
 * PENTING: Hanya boleh dipanggil di lingkungan server-side terotorisasi.
 * Wajib selalu sertakan filter user_id eksplisit saat melakukan mutasi data.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY belum disetel di environment variables.")
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
