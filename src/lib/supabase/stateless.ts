import "server-only"
import { createClient } from "@supabase/supabase-js"
import { getSupabasePublicConfig } from "@/lib/env/client"

/**
 * Client Supabase publik TANPA sesi tersimpan, khusus server: tidak membaca/menulis cookie sesi pengguna, tidak
 * me-refresh token, dan tidak membaca token dari URL. Dipakai untuk memverifikasi kredensial sekali pakai (mis. kata
 * sandi lama saat ganti kata sandi) tanpa menyentuh sesi aktif. Sesi yang terbentuk hanya hidup di memori instance
 * ini; pemanggil wajib mengakhirinya (`auth.signOut({ scope: "local" })`) agar tidak tertinggal di `auth.sessions`.
 */
export function createStatelessClient() {
  const { url, publishableKey } = getSupabasePublicConfig()

  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
