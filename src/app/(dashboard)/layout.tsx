import { DashboardShell } from "@/components/templates/dashboard-shell"
import { requireSession } from "@/lib/auth/session"

/**
 * Layout seluruh halaman dasbor (route group `(dashboard)`, URL tidak berubah).
 * Memverifikasi sesi di server (`auth.getUser()` → `redirect("/login")`) lalu merender shell persisten
 * SEKALI — sidebar & navbar tidak di-mount ulang saat navigasi. Halaman cukup merender
 * `PageContainer` + `PageHeader`. Catatan: layout tidak dirender ulang pada navigasi client, jadi
 * pemeriksaan sesi per request tetap di `src/proxy.ts`, `requireSession()` di RSC, dan `defineRoute`.
 */
export default async function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession()

  return <DashboardShell user={{ email: user.email ?? "" }}>{children}</DashboardShell>
}
