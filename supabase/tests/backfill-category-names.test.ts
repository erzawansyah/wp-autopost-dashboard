/**
 * Backfill kategori per baris (migrasi `*_backfill_requested_category_names.sql`): hanya item batch yang masih
 * akan menjalankan pre-resolve dan label `categories`-nya berupa kategori baris (bukan label kategori batch)
 * yang mendapat `source_payload.requested_category_names`; idempoten dan tidak menimpa nilai yang sudah ada.
 */
import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, readMigration, runSqlFile, seedTenant, type TenantFixture } from "./helpers/test-db"

const BACKFILL = readMigration("_backfill_requested_category_names.sql")

let db: PGlite
let tenant: TenantFixture
let batchId: string

interface ItemInput {
  state?: string
  categories?: unknown
  sourcePayload?: Record<string, unknown>
  wpPostId?: number | null
  withBatch?: boolean
}

async function insertItem(input: ItemInput = {}): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into public.post_items
       (user_id, wp_site_id, batch_id, target_keyword, title, content_html, state, categories, source_payload, wp_post_id)
     values ($1, $2, $3, 'kata kunci', 'Judul', '<p>isi</p>', $4, $5::jsonb, $6::jsonb, $7)
     returning id`,
    [
      tenant.userId,
      tenant.siteId,
      input.withBatch === false ? null : batchId,
      input.state ?? "queued_input",
      JSON.stringify(input.categories ?? ["Resep Nusantara"]),
      JSON.stringify(input.sourcePayload ?? { category_ids: [3] }),
      input.wpPostId ?? null,
    ]
  )
  const row = result.rows[0]
  if (!row) throw new Error("Insert post_items tidak mengembalikan id")
  return row.id
}

async function requestedNames(postId: string): Promise<unknown> {
  const result = await db.query<{ names: unknown }>(
    "select source_payload -> 'requested_category_names' as names from public.post_items where id = $1",
    [postId]
  )
  return result.rows[0]?.names ?? null
}

beforeAll(async () => {
  db = await createTestDb()
  tenant = await seedTenant(db, "backfill")
  // Batch lama dengan kategori tingkat batch "Umum" (label ini ditulis aplikasi lama ke item tanpa kategori baris).
  const batch = await db.query<{ id: string }>(
    `insert into public.content_batches (user_id, wp_site_id, name, status, total_items, ai_config)
     values ($1, $2, 'Batch terstruktur lama', 'running', 10, '{"category_ids": [3], "category_names": ["Umum"]}')
     returning id`,
    [tenant.userId, tenant.siteId]
  )
  const row = batch.rows[0]
  if (!row) throw new Error("Insert content_batches tidak mengembalikan id")
  batchId = row.id
}, 60_000)

afterAll(async () => {
  await db.close()
})

describe("backfill requested_category_names", () => {
  it("menyalin kategori baris ke source_payload untuk item yang masih akan di-pre-resolve", async () => {
    const queued = await insertItem()
    const failedGeneration = await insertItem({ state: "failed_generation", categories: ["Kuliner Jawa"] })
    await runSqlFile(db, BACKFILL)

    expect(await requestedNames(queued)).toEqual(["Resep Nusantara"])
    expect(await requestedNames(failedGeneration)).toEqual(["Kuliner Jawa"])
    const payload = await db.query<{ category_ids: unknown }>(
      "select source_payload -> 'category_ids' as category_ids from public.post_items where id = $1",
      [queued]
    )
    expect(payload.rows[0]?.category_ids).toEqual([3])
  })

  it("melewati label kategori batch, item tanpa batch, kategori kosong/ganda, dan item yang naskahnya sudah ada", async () => {
    const skipped = await Promise.all([
      insertItem({ categories: ["Umum"] }), // label kategori batch
      insertItem({ withBatch: false }), // Tulis Cepat
      insertItem({ categories: [] }),
      insertItem({ categories: ["  "] }),
      insertItem({ categories: ["A", "B"] }), // multi kategori = pilihan tingkat batch
      insertItem({ state: "ready_to_sync" }),
      insertItem({ state: "failed_sync" }),
      insertItem({ state: "published_on_wp", wpPostId: 77 }),
      insertItem({ state: "failed_generation", wpPostId: 78 }),
    ])
    await runSqlFile(db, BACKFILL)

    for (const postId of skipped) {
      expect(await requestedNames(postId)).toBeNull()
    }
  })

  it("idempoten dan tidak menimpa requested_category_names yang sudah ada", async () => {
    const existing = await insertItem({
      categories: ["Label Lama"],
      sourcePayload: { category_ids: [3], requested_category_names: ["Pilihan Baru"] },
    })
    const fresh = await insertItem({ categories: ["Wisata"] })
    await runSqlFile(db, BACKFILL)
    await runSqlFile(db, BACKFILL)

    expect(await requestedNames(existing)).toEqual(["Pilihan Baru"])
    expect(await requestedNames(fresh)).toEqual(["Wisata"])
  })
})
