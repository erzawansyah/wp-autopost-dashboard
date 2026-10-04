/**
 * Konfigurasi Otorisasi & Akses Fitur Internal
 */

/**
 * Memeriksa otorisasi laboratorium di sisi server berbasis preferensi Developer Mode
 */
export async function hasLabAccess(
  supabase: any,
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

/**
 * @deprecated Akses Laboratorium kini sepenuhnya dikendalikan via Developer Mode di Pengaturan Profil
 */
export function isLabAuthorizedUser(_email?: string | null): boolean {
  return false
}
