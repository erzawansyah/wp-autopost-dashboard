import { DashboardShell } from "@/components/templates/dashboard-shell"
import { requireSession } from "@/lib/auth/session"
import { getUserSettings } from "@/server/services/settings"

/**
 * Layout seluruh halaman dasbor (route group `(dashboard)`, URL tidak berubah).
 * Memverifikasi sesi di server (`auth.getUser()` → `redirect("/login")`) lalu merender shell persisten
 * SEKALI — sidebar & navbar tidak di-mount ulang saat navigasi. Halaman cukup merender
 * `PageContainer` + `PageHeader`. Catatan: layout tidak dirender ulang pada navigasi client, jadi
 * pemeriksaan sesi per request tetap di `src/proxy.ts`, `requireSession()` di RSC, dan `defineRoute`.
 */
export default async function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireSession()
  // Hanya boolean Developer Mode yang dikirim ke browser (menu Lab tampil sejak render pertama). Gagal membaca
  // pengaturan tidak boleh menjatuhkan shell: menu Lab disembunyikan, halaman tetap menangani error-nya sendiri.
  const developerMode = await getUserSettings(supabase, user.id).then(
    (settings) => settings.developerMode === true,
    () => false
  )

  return (
    <DashboardShell user={{ email: user.email ?? "" }} developerMode={developerMode}>
      {children}
    </DashboardShell>
  )
}
