import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { throwIfDbError } from "@/server/http/errors"

const FINAL_SUCCESS_STATES = new Set(["published_on_wp", "saved_draft_on_wp", "scheduled_on_wp"])
const ACTIVE_STATES = new Set(["queued_input", "generating_content", "ready_to_sync", "syncing_to_wp"])

interface SiteSummary {
  id: string
  site_name: string
  base_url: string
}

/**
 * Daftar batch milik pengguna, diawali grup virtual "Tulis Cepat" (item tanpa batch) bila ada.
 * Grup virtual berstatus `running` selama masih ada item yang menunggu/diproses.
 */
export async function listBatchesWithQuickWriter(
  supabase: SupabaseClient,
  userId: string,
  limit: number
): Promise<unknown[]> {
  const { data: batches, error } = await supabase
    .from("content_batches")
    .select(`
      id,
      name,
      source_type,
      execution_mode,
      status,
      total_items,
      completed_items,
      schedule_config,
      created_at,
      updated_at,
      wp_sites (
        id,
        site_name,
        base_url
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
  throwIfDbError(error)

  const { data: standaloneItems, error: standaloneError } = await supabase
    .from("post_items")
    .select("id, state, created_at, wp_sites ( id, site_name, base_url )")
    .eq("user_id", userId)
    .is("batch_id", null)
    .order("created_at", { ascending: false })
  throwIfDbError(standaloneError)

  const quickItems = standaloneItems ?? []
  if (quickItems.length === 0) return batches ?? []

  const latestItem = quickItems[0]
  const latestSite: SiteSummary | undefined = Array.isArray(latestItem.wp_sites)
    ? latestItem.wp_sites[0]
    : (latestItem.wp_sites ?? undefined)

  const quickWriterBatch = {
    id: "quick-writer",
    name: "Tulis Cepat (Quick Writer)",
    source_type: "quick_writer",
    execution_mode: "instant",
    status: quickItems.some((item) => ACTIVE_STATES.has(item.state)) ? "running" : "completed",
    total_items: quickItems.length,
    completed_items: quickItems.filter((item) => FINAL_SUCCESS_STATES.has(item.state)).length,
    schedule_config: { mode: "instant" },
    created_at: latestItem.created_at,
    updated_at: latestItem.created_at,
    wp_sites: latestSite ? [latestSite] : [],
  }

  return [quickWriterBatch, ...(batches ?? [])]
}
