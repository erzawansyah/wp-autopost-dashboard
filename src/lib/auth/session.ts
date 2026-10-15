import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { LOGIN_PATH } from "./routes"

/**
 * Data Access Layer sesi untuk Server Component (layout & page RSC).
 *
 * `getSession()` dibungkus React `cache`: dalam satu render, layout `(dashboard)` dan page RSC berbagi
 * SATU client Supabase sesi + SATU `auth.getUser()` (diverifikasi ke server Auth, bukan sekadar membaca cookie).
 * Pakai client ini untuk baca data milik pengguna (RLS aktif) — service `src/server/services/*` menerima
 * `(supabase, userId)` sehingga bisa dipanggil langsung dari RSC:
 *
 *   const { supabase, user } = await requireSession()
 *   const sites = await listSites(supabase, user.id)
 *
 * Jangan pernah memakai `createAdminClient()` untuk data milik pengguna di RSC.
 */

type SessionClient = Awaited<ReturnType<typeof createClient>>

export interface Session {
  supabase: SessionClient
  user: User | null
}

export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  return { supabase, user: error ? null : data.user }
})

/** Sesi wajib: tanpa pengguna → `redirect("/login")` (proxy biasanya sudah mengalihkan lebih dulu, lengkap dengan `next`). */
export async function requireSession(): Promise<{ supabase: SessionClient; user: User }> {
  const { supabase, user } = await getSession()
  if (!user) redirect(LOGIN_PATH)
  return { supabase, user }
}
