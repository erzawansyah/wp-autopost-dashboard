/**
 * Isolasi tenant (RLS + GRANT) untuk SETIAP tabel: pengguna A tidak dapat membaca, menyisipkan
 * atas nama, mengubah, atau menghapus baris milik pengguna B — dan tetap dapat menjalankan
 * operasi yang memang dipakai aplikasi atas barisnya sendiri.
 */
import { randomUUID } from "node:crypto"
import type { PGlite, Transaction } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  APP_TABLES,
  type AppTable,
  asAnon,
  asServiceRole,
  asUser,
  countRows,
  createTestDb,
  PERMISSION_DENIED,
  RLS_VIOLATION,
  seedTenant,
  type TenantFixture,
} from "./helpers/test-db"

/**
 * Hak tulis `authenticated` per tabel:
 * - crud: tabel konfigurasi milik tenant;
 * - enqueue: post_items (insert queued_input + delete; transisi state hanya worker);
 * - append-only: execution_logs;
 * - read-only: tabel yang hanya ditulis worker (service_role).
 */
type WriteAccess = "crud" | "enqueue" | "append-only" | "read-only"

interface TableCase {
  table: AppTable
  key: keyof TenantFixture
  access: WriteAccess
  /** INSERT satu baris baru milik `owner` (semua rujukan induk dari fixture `owner`). */
  insert: (owner: TenantFixture) => { sql: string; params: unknown[] }
  /** UPDATE baris dengan id $1. */
  update: string
}

const unique = () => randomUUID().slice(0, 8)

const CASES: TableCase[] = [
  {
    table: "wp_sites",
    key: "siteId",
    access: "crud",
    insert: (o) => ({
      sql: `insert into public.wp_sites (user_id, site_name, base_url, wp_username, encrypted_app_password)
            values ($1, 'Baru', $2, 'editor', 'iv:tag:cipher')`,
      params: [o.userId, `https://baru-${unique()}.example.test`],
    }),
    update: "update public.wp_sites set site_name = 'diretas' where id = $1",
  },
  {
    table: "content_batches",
    key: "batchId",
    access: "crud",
    insert: (o) => ({
      sql: "insert into public.content_batches (user_id, wp_site_id, name) values ($1, $2, 'Batch baru')",
      params: [o.userId, o.siteId],
    }),
    update: "update public.content_batches set name = 'diretas' where id = $1",
  },
  {
    table: "post_items",
    key: "postId",
    access: "enqueue",
    insert: (o) => ({
      sql: "insert into public.post_items (user_id, wp_site_id, batch_id, target_keyword) values ($1, $2, $3, 'kw baru')",
      params: [o.userId, o.siteId, o.batchId],
    }),
    update: "update public.post_items set state = 'published_on_wp' where id = $1",
  },
  {
    table: "execution_logs",
    key: "logId",
    access: "append-only",
    insert: (o) => ({
      sql: "insert into public.execution_logs (post_item_id, user_id, step, message) values ($2, $1, 'queue', 'log baru')",
      params: [o.userId, o.postId],
    }),
    update: "update public.execution_logs set message = 'diretas' where id = $1",
  },
  {
    table: "agent_profiles",
    key: "profileId",
    access: "crud",
    insert: (o) => ({
      sql: "insert into public.agent_profiles (user_id, name, mode, workflow_prompt) values ($1, 'Profil baru', 'deep', 'w')",
      params: [o.userId],
    }),
    update: "update public.agent_profiles set name = 'diretas' where id = $1",
  },
  {
    table: "agent_runs",
    key: "runId",
    access: "read-only",
    insert: (o) => ({
      sql: "insert into public.agent_runs (post_item_id, user_id, profile_ref, status) values ($2, $1, 'preset:x', 'running')",
      params: [o.userId, o.postId],
    }),
    update: "update public.agent_runs set status = 'failed' where id = $1",
  },
  {
    table: "agent_skills",
    key: "skillId",
    access: "crud",
    insert: (o) => ({
      sql: "insert into public.agent_skills (user_id, name, slug, content) values ($1, 'Skill baru', $2, 'isi')",
      params: [o.userId, `skill-${unique()}`],
    }),
    update: "update public.agent_skills set content = 'diretas' where id = $1",
  },
  {
    table: "user_settings",
    key: "settingsId",
    access: "crud",
    // Jalur aplikasi (PUT /api/settings/user): upsert onConflict user_id.
    insert: (o) => ({
      sql: `insert into public.user_settings (user_id, searxng_url) values ($1, 'https://searx.example.test')
            on conflict (user_id) do update set searxng_url = excluded.searxng_url`,
      params: [o.userId],
    }),
    update: "update public.user_settings set searxng_url = 'https://evil.example.test' where id = $1",
  },
  {
    table: "webhooks",
    key: "webhookId",
    access: "crud",
    insert: (o) => ({
      sql: `insert into public.webhooks (user_id, name, url, encrypted_secret, events)
            values ($1, 'Hook baru', 'https://hooks.example.test/x', 'iv:tag:cipher', '["post.failed"]')`,
      params: [o.userId],
    }),
    update: "update public.webhooks set url = 'https://evil.example.test' where id = $1",
  },
  {
    table: "uploaded_media",
    key: "mediaId",
    access: "read-only",
    insert: (o) => ({
      sql: `insert into public.uploaded_media (user_id, site_id, source_url, site_url, image_id)
            values ($1, $2, 'https://img.example.test/b.jpg', 'https://site.example.test/b.jpg', 7)`,
      params: [o.userId, o.siteId],
    }),
    update: "update public.uploaded_media set image_id = 999 where id = $1",
  },
  {
    table: "generation_checkpoints",
    key: "checkpointId",
    access: "read-only",
    insert: (o) => ({
      sql: `insert into public.generation_checkpoints (post_item_id, user_id, step, schema_version, data)
            values ($2, $1, 'draft', 1, '{"inputKey": "palsu"}')`,
      params: [o.userId, o.postId],
    }),
    update: `update public.generation_checkpoints set data = '{"inputKey": "diretas"}' where id = $1`,
  },
]

let db: PGlite
let a: TenantFixture
let b: TenantFixture

async function rowJson(table: AppTable, id: string): Promise<unknown> {
  const result = await db.query<{ row: unknown }>(`select to_jsonb(t) as row from public.${table} as t where id = $1`, [id])
  return result.rows[0]?.row ?? null
}

/** Jalankan perubahan sebagai A lalu batalkan (rollback) agar fixture tetap utuh. */
class Rollback extends Error {}
async function asUserRolledBack<T>(userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let value: T | undefined
  let captured = false
  try {
    await asUser(db, userId, async (tx) => {
      value = await fn(tx)
      captured = true
      throw new Rollback()
    })
  } catch (err: unknown) {
    if (!(err instanceof Rollback)) throw err
  }
  if (!captured) throw new Error("callback tidak selesai")
  return value as T
}

beforeAll(async () => {
  db = await createTestDb()
  a = await seedTenant(db, "tenant-a")
  b = await seedTenant(db, "tenant-b")
}, 60_000)

afterAll(async () => {
  await db.close()
})

it("matriks test mencakup seluruh 11 tabel aplikasi", () => {
  expect(CASES.map((c) => c.table).sort()).toEqual([...APP_TABLES].sort())
})

describe.each(CASES)("$table ($access)", ({ table, key, access, insert, update }) => {
  it("A tidak melihat baris B, dan hanya melihat barisnya sendiri", async () => {
    const visibleForeign = await asUser(db, a.userId, (tx) => countRows(tx, table, b[key]))
    expect(visibleForeign).toBe(0)

    const visibleOwn = await asUser(db, a.userId, (tx) => countRows(tx, table, a[key]))
    expect(visibleOwn).toBe(1)

    const owners = await asUser(db, a.userId, (tx) =>
      tx.query<{ user_id: string | null }>(`select distinct user_id from public.${table}`)
    )
    const ownerIds = owners.rows.map((row) => row.user_id)
    expect(ownerIds).toContain(a.userId)
    expect(ownerIds).not.toContain(b.userId)
  })

  it("A tidak dapat menyisipkan baris atas nama B", async () => {
    const { sql, params } = insert(b)
    const expected = access === "read-only" ? PERMISSION_DENIED : RLS_VIOLATION
    await expect(asUser(db, a.userId, (tx) => tx.query(sql, params))).rejects.toThrow(expected)
  })

  it("A tidak dapat mengubah baris B", async () => {
    const before = await rowJson(table, b[key])
    if (access === "crud") {
      const result = await asUser(db, a.userId, (tx) => tx.query(update, [b[key]]))
      expect(result.affectedRows).toBe(0)
    } else {
      await expect(asUser(db, a.userId, (tx) => tx.query(update, [b[key]]))).rejects.toThrow(PERMISSION_DENIED)
    }
    expect(await rowJson(table, b[key])).toEqual(before)
  })

  it("A tidak dapat menghapus baris B", async () => {
    const sql = `delete from public.${table} where id = $1`
    if (access === "crud" || access === "enqueue") {
      const result = await asUser(db, a.userId, (tx) => tx.query(sql, [b[key]]))
      expect(result.affectedRows).toBe(0)
    } else {
      await expect(asUser(db, a.userId, (tx) => tx.query(sql, [b[key]]))).rejects.toThrow(PERMISSION_DENIED)
    }
    expect(await countRows(db, table, b[key])).toBe(1)
  })

  it("A tetap dapat menjalankan operasi yang dipakai aplikasi atas barisnya sendiri", async () => {
    const { sql, params } = insert(a)
    if (access === "read-only") {
      await expect(asUser(db, a.userId, (tx) => tx.query(sql, params))).rejects.toThrow(PERMISSION_DENIED)
    } else {
      const inserted = await asUserRolledBack(a.userId, (tx) => tx.query(sql, params))
      expect(inserted.affectedRows).toBe(1)
    }

    if (access === "crud") {
      const updated = await asUserRolledBack(a.userId, (tx) => tx.query(update, [a[key]]))
      expect(updated.affectedRows).toBe(1)
    } else {
      await expect(asUser(db, a.userId, (tx) => tx.query(update, [a[key]]))).rejects.toThrow(PERMISSION_DENIED)
    }

    const deleteSql = `delete from public.${table} where id = $1`
    if (access === "crud" || access === "enqueue") {
      const deleted = await asUserRolledBack(a.userId, (tx) => tx.query(deleteSql, [a[key]]))
      expect(deleted.affectedRows).toBe(1)
    } else {
      await expect(asUser(db, a.userId, (tx) => tx.query(deleteSql, [a[key]]))).rejects.toThrow(PERMISSION_DENIED)
    }
    expect(await countRows(db, table, a[key])).toBe(1)
  })

  it("anon tidak punya akses sama sekali", async () => {
    await expect(asAnon(db, (tx) => tx.query(`select count(*) from public.${table}`))).rejects.toThrow(
      PERMISSION_DENIED
    )
  })

  it("service_role (worker) melihat baris semua tenant", async () => {
    const visible = await asServiceRole(db, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int as n from public.${table} where id = any($1::uuid[])`, [
        [a[key], b[key]],
      ])
    )
    expect(visible.rows[0]?.n).toBe(2)
  })
})

describe("agent_skills: skill sistem", () => {
  async function systemSkillId(): Promise<string> {
    const result = await db.query<{ id: string }>(
      "select id from public.agent_skills where is_system and slug = 'anti-ai-editor'"
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error("seed anti-ai-editor tidak ada")
    return id
  }

  it("terlihat oleh setiap pengguna login, tidak oleh anon", async () => {
    const id = await systemSkillId()
    expect(await asUser(db, a.userId, (tx) => countRows(tx, "agent_skills", id))).toBe(1)
    expect(await asUser(db, b.userId, (tx) => countRows(tx, "agent_skills", id))).toBe(1)
    await expect(asAnon(db, (tx) => countRows(tx, "agent_skills", id))).rejects.toThrow(PERMISSION_DENIED)
  })

  it("tidak dapat diubah atau dihapus pengguna", async () => {
    const id = await systemSkillId()
    const updated = await asUser(db, a.userId, (tx) =>
      tx.query("update public.agent_skills set content = 'diretas' where id = $1", [id])
    )
    expect(updated.affectedRows).toBe(0)
    const deleted = await asUser(db, a.userId, (tx) => tx.query("delete from public.agent_skills where id = $1", [id]))
    expect(deleted.affectedRows).toBe(0)
    expect(await countRows(db, "agent_skills", id)).toBe(1)
  })

  it("pengguna tidak dapat membuat skill sistem atau menjadikan skill-nya sistem", async () => {
    await expect(
      asUser(db, a.userId, (tx) =>
        tx.query(
          "insert into public.agent_skills (user_id, name, slug, content, is_system) values ($1, 'Palsu', 'palsu', 'x', true)",
          [a.userId]
        )
      )
    ).rejects.toThrow(RLS_VIOLATION)
    await expect(
      asUser(db, a.userId, (tx) =>
        tx.query("update public.agent_skills set is_system = true, user_id = null where id = $1", [a.skillId])
      )
    ).rejects.toThrow(RLS_VIOLATION)
  })
})

describe("uploaded_media: isolasi cache media", () => {
  it("tidak ada visibilitas lintas tenant (tanpa celah user_id IS NULL)", async () => {
    const seenByB = await asUser(db, b.userId, (tx) =>
      tx.query<{ id: string }>("select id from public.uploaded_media where site_id = $1", [a.siteId])
    )
    expect(seenByB.rows).toEqual([])

    await expect(
      asServiceRole(db, (tx) =>
        tx.query(
          `insert into public.uploaded_media (site_id, source_url, site_url, image_id)
           values ($1, 'https://img.example.test/null.jpg', 'https://site.example.test/null.jpg', 1)`,
          [a.siteId]
        )
      )
    ).rejects.toThrow(/null value in column "user_id"/)
  })

  it("pemilik tidak dapat memindahkan barisnya ke tenant lain (UPDATE hanya worker)", async () => {
    await expect(
      asUser(db, a.userId, (tx) =>
        tx.query("update public.uploaded_media set user_id = $1 where id = $2", [b.userId, a.mediaId])
      )
    ).rejects.toThrow(PERMISSION_DENIED)
  })
})

describe("UPDATE tidak dapat memindahkan kepemilikan baris", () => {
  it.each(["wp_sites", "content_batches", "agent_profiles", "user_settings", "webhooks"] as const)(
    "%s: user_id tidak dapat diganti ke pengguna lain",
    async (table) => {
      const keyByTable: Record<typeof table, keyof TenantFixture> = {
        wp_sites: "siteId",
        content_batches: "batchId",
        agent_profiles: "profileId",
        user_settings: "settingsId",
        webhooks: "webhookId",
      }
      const id = a[keyByTable[table]]
      await expect(
        asUser(db, a.userId, (tx) => tx.query(`update public.${table} set user_id = $1 where id = $2`, [b.userId, id]))
      ).rejects.toThrow(RLS_VIOLATION)
    }
  )
})
