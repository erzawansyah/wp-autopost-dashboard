/**
 * Publikasi Realtime (migrasi `*_realtime_publication.sql`): `post_items` & `execution_logs` didaftarkan
 * ke publication `supabase_realtime` hanya bila publication itu ada (Supabase), idempoten, dan tidak
 * pernah menyertakan tabel bersecret. Prelude PGlite tidak membuat publication → migrasi tidak berefek.
 */
import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, readMigration, runSqlFile } from "./helpers/test-db"

const MIGRATION = readMigration("_realtime_publication.sql")
const SECRET_TABLES = ["user_settings", "wp_sites", "webhooks"]

let db: PGlite

beforeAll(async () => {
  db = await createTestDb()
}, 60_000)

afterAll(async () => {
  await db.close()
})

async function publishedTables(): Promise<string[]> {
  const result = await db.query<{ tablename: string }>(
    `select tablename from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
     order by tablename`
  )
  return result.rows.map((row) => row.tablename)
}

async function dropPublication(): Promise<void> {
  await db.exec("drop publication if exists supabase_realtime")
}

describe("publication supabase_realtime", () => {
  it("tanpa publication (prelude test / Postgres polos): migrasi berhasil tanpa membuat publication", async () => {
    await runSqlFile(db, MIGRATION)
    const result = await db.query("select 1 from pg_publication where pubname = 'supabase_realtime'")
    expect(result.rows).toHaveLength(0)
  })

  it("publication ada: hanya post_items & execution_logs yang ditambahkan, idempoten", async () => {
    await db.exec("create publication supabase_realtime")
    try {
      await runSqlFile(db, MIGRATION)
      await runSqlFile(db, MIGRATION)
      const tables = await publishedTables()
      expect(tables).toEqual(["execution_logs", "post_items"])
      for (const secret of SECRET_TABLES) expect(tables).not.toContain(secret)
    } finally {
      await dropPublication()
    }
  })

  it("tabel yang sudah terdaftar dilewati; tabel lain di publication tidak disentuh", async () => {
    await db.exec("create publication supabase_realtime for table public.post_items, public.content_batches")
    try {
      await runSqlFile(db, MIGRATION)
      expect(await publishedTables()).toEqual(["content_batches", "execution_logs", "post_items"])
    } finally {
      await dropPublication()
    }
  })

  it("publication FOR ALL TABLES: migrasi tidak mencoba ALTER (tidak error)", async () => {
    await db.exec("create publication supabase_realtime for all tables")
    try {
      await expect(runSqlFile(db, MIGRATION)).resolves.toBeUndefined()
    } finally {
      await dropPublication()
    }
  })

  it("replica identity tetap default (payload DELETE hanya PK; client tidak berlangganan DELETE)", async () => {
    const result = await db.query<{ relname: string; relreplident: string }>(
      `select relname, relreplident from pg_class
       where relnamespace = 'public'::regnamespace and relname in ('post_items', 'execution_logs')
       order by relname`
    )
    expect(result.rows).toEqual([
      { relname: "execution_logs", relreplident: "d" },
      { relname: "post_items", relreplident: "d" },
    ])
  })
})
