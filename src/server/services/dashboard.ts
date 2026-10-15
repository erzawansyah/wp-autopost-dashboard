import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { FAILED_STATES, IN_FLIGHT_STATES } from "@/lib/queue/states"
import { throwIfDbError } from "@/server/http/errors"
import type { DashboardStats } from "@/types/dashboard"
import type { PostItemState } from "@/types/queue"

/**
 * Service ringkasan dasbor (`/`). Daftar situs & artikel terbaru memakai service domainnya
 * (`listSites`, `listPosts`); di sini hanya agregat yang tidak tersedia di API daftar.
 */

/** Jumlah item milik pengguna pada `states`: `count` tanpa baris (`head`) → tidak terpotong batas baris PostgREST. */
async function countPostItems(
  supabase: SupabaseClient,
  userId: string,
  states: Iterable<PostItemState>
): Promise<number> {
  const { count, error } = await supabase
    .from("post_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("state", [...states])
  throwIfDbError(error)
  return count ?? 0
}

/** Jumlah SELURUH item antrean milik pengguna per kelompok state (4 query paralel). */
export async function getDashboardStats(supabase: SupabaseClient, userId: string): Promise<DashboardStats> {
  const [published, inFlight, onWordPress, failed] = await Promise.all([
    countPostItems(supabase, userId, ["published_on_wp"]),
    countPostItems(supabase, userId, IN_FLIGHT_STATES),
    countPostItems(supabase, userId, ["saved_draft_on_wp", "scheduled_on_wp"]),
    countPostItems(supabase, userId, FAILED_STATES),
  ])
  return { published, inFlight, onWordPress, failed }
}
