import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabasePublicConfig } from "@/lib/env/client"

export async function createClient() {
  const cookieStore = await cookies()

  const { url, publishableKey } = getSupabasePublicConfig()

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Dipanggil dari Server Component, aman diabaikan jika ada middleware/session refresher
        }
      },
    },
  })
}
