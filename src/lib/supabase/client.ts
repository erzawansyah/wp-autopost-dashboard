import { createBrowserClient } from "@supabase/ssr"
import { getSupabasePublicConfig } from "@/lib/env/client"

export function createClient() {
  const { url, publishableKey } = getSupabasePublicConfig()

  return createBrowserClient(url, publishableKey)
}
