import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { throwIfDbError } from "@/server/http/errors"
import { QUICK_WRITER_BATCH_ID, QUICK_WRITER_BATCH_NAME } from "@/lib/validation/queue"
import type { Batch, PostItemState } from "@/types/queue"
import type { SiteRef } from "@/types/site"

const FINAL_SUCCESS_STATES = new Set<PostItemState>(["published_on_wp", "saved_draft_on_wp", "scheduled_on_wp"])
const ACTIVE_STATES = new Set<PostItemState>(["queued_input", "generating_content", "ready_to_sync", "syncing_to_wp"])

const BATCH_COLUMNS = `
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
  wp_sites ( id, site_name, base_url )
`

/** Relasi to-one PostgREST dapat terbaca sebagai objek atau array (tanpa tipe hasil generate) → selalu objek. */
function toSiteRef(value: SiteRef | SiteRef[] | null | undefined): SiteRef | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

interface StandaloneItemRow {
  id: string
  state: PostItemState
  created_at: string
  wp_sites: SiteRef | SiteRef[] | null
}

/**
 * Daftar batch milik pengguna, diawali grup virtual "Tulis Cepat" (item tanpa batch) bila ada.
 * Grup virtual berbentuk sama dengan batch biasa (`wp_sites` = situs item terbaru, objek); berstatus
 * `running` selama masih ada item yang menunggu/diproses.
 */
export async function listBatchesWithQuickWriter(
  supabase: SupabaseClient,
  userId: string,
  limit: number
): Promise<Batch[]> {
  const [batchesResult, standaloneResult] = await Promise.all([
    supabase
      .from("content_batches")
      .select(BATCH_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("post_items")
      .select("id, state, created_at, wp_sites ( id, site_name, base_url )")
      .eq("user_id", userId)
      .is("batch_id", null)
      .order("created_at", { ascending: false }),
  ])
  throwIfDbError(batchesResult.error)
  throwIfDbError(standaloneResult.error)

  const batches = ((batchesResult.data ?? []) as unknown as Array<Omit<Batch, "wp_sites"> & { wp_sites: SiteRef | SiteRef[] | null }>).map(
    (batch) => ({ ...batch, wp_sites: toSiteRef(batch.wp_sites) })
  )

  const quickItems = (standaloneResult.data ?? []) as unknown as StandaloneItemRow[]
  if (quickItems.length === 0) return batches

  const latestItem = quickItems[0]
  const quickWriterBatch: Batch = {
    id: QUICK_WRITER_BATCH_ID,
    name: QUICK_WRITER_BATCH_NAME,
    source_type: "quick_writer",
    execution_mode: "instant",
    status: quickItems.some((item) => ACTIVE_STATES.has(item.state)) ? "running" : "completed",
    total_items: quickItems.length,
    completed_items: quickItems.filter((item) => FINAL_SUCCESS_STATES.has(item.state)).length,
    schedule_config: { mode: "instant" },
    created_at: latestItem.created_at,
    updated_at: latestItem.created_at,
    wp_sites: toSiteRef(latestItem.wp_sites),
  }

  return [quickWriterBatch, ...batches]
}
