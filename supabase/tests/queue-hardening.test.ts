/**
 * Hardening antrean (migrasi `*_queue_hardening.sql`): GRANT INSERT per kolom untuk sesi pengguna,
 * batas retry_count & wp_sites.max_concurrency (termasuk normalisasi data lama), dan token lease
 * unik per klaim.
 */
import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  asServiceRole,
  asUser,
  CHECK_VIOLATION,
  createTestDb,
  PERMISSION_DENIED,
  readMigration,
  runSqlFile,
  seedTenant,
  type TenantFixture,
} from "./helpers/test-db"

let db: PGlite
let a: TenantFixture

beforeAll(async () => {
  db = await createTestDb()
  a = await seedTenant(db, "hardening")
}, 60_000)

afterAll(async () => {
  await db.close()
})

/** Kolom yang benar-benar dikirim src/server/queue/enqueue.ts (Tulis Cepat & batch). */
const QUICK_POST_SQL = `insert into public.post_items
  (user_id, wp_site_id, target_keyword, state, wp_target_status, custom_instructions_override, categories, tags, source_payload)
  values ($1, $2, 'kopi', 'queued_input', 'draft', null, '["Minuman"]', '["kopi"]', '{"agentProfileRef": "preset:quick-writer"}')
  returning id, retry_count, last_error`
const BATCH_ITEM_SQL = `insert into public.post_items
  (batch_id, user_id, wp_site_id, target_keyword, title, state, scheduled_for, wp_target_status, categories, tags,
   custom_instructions_override, source_payload)
  values ($3, $1, $2, 'teh', 'Judul', 'queued_input', now() + interval '1 day', 'publish', '[]', '[]', 'brief', '{}')
  returning id`

describe("GRANT INSERT per kolom untuk sesi pengguna", () => {
  it("jalur enqueue Tulis Cepat & batch tetap dapat mengantrekan item", async () => {
    const quick = await asUser(db, a.userId, (tx) =>
      tx.query<{ id: string; retry_count: number; last_error: string | null }>(QUICK_POST_SQL, [a.userId, a.siteId])
    )
    expect(quick.rows[0]).toMatchObject({ retry_count: 0, last_error: null })

    const batch = await asUser(db, a.userId, (tx) => tx.query(BATCH_ITEM_SQL, [a.userId, a.siteId, a.batchId]))
    expect(batch.rows).toHaveLength(1)
  })

  it.each([
    ["retry_count", "2147483647"],
    ["last_error", "'palsu'"],
    ["created_at", "'1970-01-01'"],
    ["updated_at", "'1970-01-01'"],
    ["next_attempt_at", "now()"],
    ["content_html", "'<p>x</p>'"],
    ["wp_post_id", "1"],
    ["wp_post_url", "'https://x.test/?p=1'"],
    ["id", "gen_random_uuid()"],
  ])("kolom %s tidak dapat diisi sesi pengguna saat INSERT", async (column, value) => {
    await expect(
      asUser(db, a.userId, (tx) =>
        tx.query(
          `insert into public.post_items (user_id, wp_site_id, target_keyword, ${column}) values ($1, $2, 'kw', ${value})`,
          [a.userId, a.siteId]
        )
      )
    ).rejects.toThrow(PERMISSION_DENIED)
  })

  it("hak INSERT tabel penuh dicabut; hanya kolom input antrean yang diberikan", async () => {
    const privileges = await db.query<{ table_insert: boolean; keyword: boolean; retry: boolean; locked: boolean }>(
      `select has_table_privilege('authenticated', 'public.post_items', 'INSERT') as table_insert,
              has_column_privilege('authenticated', 'public.post_items', 'target_keyword', 'INSERT') as keyword,
              has_column_privilege('authenticated', 'public.post_items', 'retry_count', 'INSERT') as retry,
              has_column_privilege('authenticated', 'public.post_items', 'locked_by', 'INSERT') as locked`
    )
    expect(privileges.rows[0]).toEqual({ table_insert: false, keyword: true, retry: false, locked: false })
  })
})

describe("batas nilai numerik", () => {
  it("retry_count dibatasi 0..1000 bahkan untuk service_role", async () => {
    await expect(
      asServiceRole(db, (tx) => tx.query("update public.post_items set retry_count = 1001 where id = $1", [a.postId]))
    ).rejects.toThrow(CHECK_VIOLATION)
    const ok = await asServiceRole(db, (tx) =>
      tx.query("update public.post_items set retry_count = 1000 where id = $1", [a.postId])
    )
    expect(ok.affectedRows).toBe(1)
  })

  it("wp_sites.max_concurrency yang dapat diubah tenant dibatasi 1..10", async () => {
    for (const value of [0, 11, 1000]) {
      await expect(
        asUser(db, a.userId, (tx) =>
          tx.query("update public.wp_sites set max_concurrency = $1 where id = $2", [value, a.siteId])
        )
      ).rejects.toThrow(CHECK_VIOLATION)
    }
    const ok = await asUser(db, a.userId, (tx) =>
      tx.query("update public.wp_sites set max_concurrency = 10 where id = $1", [a.siteId])
    )
    expect(ok.affectedRows).toBe(1)
  })

  it("data lama di luar rentang dinormalkan sebelum constraint dipasang (idempoten)", async () => {
    await db.exec(`
      alter table public.post_items drop constraint post_items_retry_count_check;
      alter table public.wp_sites drop constraint wp_sites_max_concurrency_check;
    `)
    await db.query("update public.post_items set retry_count = 2147483647 where id = $1", [a.postId])
    await db.query("update public.wp_sites set max_concurrency = 500 where id = $1", [a.siteId])

    const hardening = readMigration("_queue_hardening.sql")
    await runSqlFile(db, hardening)
    await runSqlFile(db, hardening)

    const values = await db.query<{ retry_count: number; max_concurrency: number }>(
      `select p.retry_count, s.max_concurrency
       from public.post_items as p join public.wp_sites as s on s.id = p.wp_site_id
       where p.id = $1`,
      [a.postId]
    )
    expect(values.rows[0]).toEqual({ retry_count: 1000, max_concurrency: 10 })
  })
})
