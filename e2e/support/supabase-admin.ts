import { randomBytes } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { E2E_EMAIL_DOMAIN } from "./config"

/**
 * Akses Service Role ke Supabase LOKAL untuk menyiapkan & memverifikasi data test (akun uji, seed antrean,
 * state item). Bukan bagian aplikasi — hanya harness E2E.
 */

export type AdminClient = SupabaseClient

export interface TestAccount {
  id: string
  email: string
  password: string
}

export function createAdminClient(url: string, secretKey: string): AdminClient {
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "user"
  )
}

/** Alamat email unik untuk akun uji (domain khusus E2E; dibersihkan global setup/teardown). */
export function testEmail(runId: string, label: string): string {
  return `${slugify(label)}-${runId}-${randomBytes(3).toString("hex")}@${E2E_EMAIL_DOMAIN}`
}

/** Akun uji terkonfirmasi (Admin API), siap login lewat form. */
export async function createTestAccount(admin: AdminClient, runId: string, label: string): Promise<TestAccount> {
  const email = testEmail(runId, label)
  const password = `E2e-${randomBytes(12).toString("hex")}`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`Gagal membuat akun uji ${email}: ${error?.message ?? "tanpa data"}`)
  return { id: data.user.id, email, password }
}

/**
 * Hapus semua akun berdomain E2E (kaskade ke situs, antrean, log, pengaturan). Hanya domain E2E —
 * data pengembang lain di Supabase lokal tidak disentuh.
 */
export async function deleteE2eAccounts(admin: AdminClient): Promise<number> {
  const suffix = `@${E2E_EMAIL_DOMAIN}`
  const ids: string[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Gagal membaca daftar akun: ${error.message}`)
    ids.push(...data.users.filter((user) => user.email?.endsWith(suffix)).map((user) => user.id))
    if (data.users.length < 1000) break
  }
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) throw new Error(`Gagal menghapus akun uji ${id}: ${error.message}`)
  }
  return ids.length
}

/** State antrean yang akan diklaim runner (lihat `claim_post_items`) atau sedang dikerjakan. */
const ACTIVE_QUEUE_STATES = ["queued_input", "generating_content", "ready_to_sync", "syncing_to_wp"]

/**
 * Runner tertanam aplikasi uji memproses SEMUA tenant di database. Bila Supabase lokal berisi antrean aktif
 * milik akun non-E2E (data dev pengembang), run E2E akan ikut memprosesnya — tolak kecuali diizinkan eksplisit.
 */
export async function assertNoForeignActiveQueue(admin: AdminClient): Promise<void> {
  if (process.env.E2E_ALLOW_SHARED_DB === "1") return
  const { data, error } = await admin.from("post_items").select("id, user_id").in("state", ACTIVE_QUEUE_STATES).limit(1000)
  if (error) throw new Error(`Gagal memeriksa antrean di Supabase lokal: ${error.message}`)
  const rows = (data ?? []) as Array<{ id: string; user_id: string }>
  if (rows.length === 0) return

  const owners = new Set(rows.map((row) => row.user_id))
  const foreign: string[] = []
  for (const id of owners) {
    const { data: user } = await admin.auth.admin.getUserById(id)
    if (!user.user?.email?.endsWith(`@${E2E_EMAIL_DOMAIN}`)) foreign.push(id)
  }
  if (foreign.length > 0) {
    throw new Error(
      `Supabase lokal berisi antrean aktif milik ${foreign.length} akun non-E2E; runner aplikasi uji akan ikut ` +
        "memprosesnya. Jalankan `npx supabase db reset` (menghapus data lokal) atau setel E2E_ALLOW_SHARED_DB=1."
    )
  }
}

export interface PostItemRow {
  id: string
  state: string
  wp_target_status: string | null
  wp_post_id: number | null
  wp_post_url: string | null
  last_error: string | null
}

const POST_ITEM_COLUMNS = "id, state, wp_target_status, wp_post_id, wp_post_url, last_error"

export async function getPostItem(admin: AdminClient, id: string): Promise<PostItemRow> {
  const { data, error } = await admin.from("post_items").select(POST_ITEM_COLUMNS).eq("id", id).single()
  if (error || !data) throw new Error(`post_items ${id} tidak ditemukan: ${error?.message ?? "tanpa data"}`)
  return data as PostItemRow
}

export interface SeedReadyToSyncInput {
  userId: string
  siteId: string
  keyword: string
  title: string
  contentHtml: string
  excerpt?: string
  categoryIds?: number[]
}

/**
 * Seed item `ready_to_sync` dengan naskah tersimpan (jalur Cost-Saver tanpa LLM). Ditulis lewat Service Role
 * karena sesi pengguna hanya boleh INSERT kolom input antrean dengan `state = 'queued_input'`.
 */
export async function seedReadyToSyncItem(admin: AdminClient, input: SeedReadyToSyncInput): Promise<string> {
  const { data, error } = await admin
    .from("post_items")
    .insert({
      user_id: input.userId,
      wp_site_id: input.siteId,
      target_keyword: input.keyword,
      title: input.title,
      content_html: input.contentHtml,
      excerpt: input.excerpt ?? null,
      state: "ready_to_sync",
      wp_target_status: "draft",
      categories: [],
      tags: [],
      source_payload: { wp_publish_meta: { categoryIds: input.categoryIds ?? [], tagIds: [] } },
    })
    .select("id")
    .single()
  if (error || !data) throw new Error(`Gagal seed post_items: ${error?.message ?? "tanpa data"}`)
  return (data as { id: string }).id
}
