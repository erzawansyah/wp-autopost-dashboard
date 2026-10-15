import { LabAccessDenied } from "@/components/organisms/lab/lab-access-denied"
import { requireSession } from "@/lib/auth/session"
import { getLabAccess } from "@/server/services/lab"

/**
 * Gerbang server Laboratorium: tanpa Developer Mode → halaman penjelasan (bukan sekadar menu disembunyikan
 * di client). Layout tidak mencegah page anak dirender, jadi page `/lab` memeriksa ulang sebelum membaca
 * data (query yang sama, ter-cache per request) dan route `/api/lab/**` tetap memakai `assertLabAccess`.
 */
export default async function LabLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireSession()
  if (!(await getLabAccess(supabase, user))) return <LabAccessDenied />
  return children
}
