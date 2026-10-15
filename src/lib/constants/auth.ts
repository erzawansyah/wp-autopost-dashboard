import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Konfigurasi Otorisasi & Akses Fitur Internal
 */

/**
 * Memeriksa otorisasi laboratorium di sisi server berbasis preferensi Developer Mode
 */
export async function hasLabAccess(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<boolean> {
  if (!user || !user.id) return false

  const { data } = await supabase
    .from("user_settings")
    .select("notification_prefs")
    .eq("user_id", user.id)
    .maybeSingle()

  return Boolean(data?.notification_prefs?.developer_mode)
}
