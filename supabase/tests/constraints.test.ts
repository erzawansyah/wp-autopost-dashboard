/**
 * Integritas data: FK komposit anti lintas-tenant, CHECK state machine & enum, UNIQUE,
 * guard antrean untuk sesi pengguna, trigger updated_at, dan perilaku ON DELETE.
 */
import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  APP_TABLES,
  asServiceRole,
  asUser,
  CHECK_VIOLATION,
  countRows,
  createTestDb,
  FK_VIOLATION,
  PERMISSION_DENIED,
  RLS_VIOLATION,
  seedTenant,
  type TenantFixture,
  UNIQUE_VIOLATION,
} from "./helpers/test-db"

const POST_ITEM_STATES = [
  "queued_input",
  "generating_content",
  "ready_to_sync",
  "syncing_to_wp",
  "published_on_wp",
  "scheduled_on_wp",
  "saved_draft_on_wp",
  "failed_generation",
  "failed_sync",
] as const

let db: PGlite
let a: TenantFixture
let b: TenantFixture

beforeAll(async () => {
  db = await createTestDb()
  a = await seedTenant(db, "tenant-a")
  b = await seedTenant(db, "tenant-b")
}, 60_000)

afterAll(async () => {
  await db.close()
})

describe("FK komposit (child, user_id) → parent (id, user_id)", () => {
  it("post_item milik A tidak dapat merujuk situs B — bahkan lewat service_role", async () => {
    await expect(
      asServiceRole(db, (tx) =>
        tx.query("insert into public.post_items (user_id, wp_site_id, target_keyword) values ($1, $2, 'kw')", [
          a.userId,
          b.siteId,
        ])
      )
    ).rejects.toThrow(FK_VIOLATION)
  })

  it("post_item milik A tidak dapat merujuk batch B", async () => {
    await expect(
      asServiceRole(db, (tx) =>
        tx.query(
          "insert into public.post_items (user_id, wp_site_id, batch_id, target_keyword) values ($1, $2, $3, 'kw')",
          [a.userId, a.siteId, b.batchId]
        )
      )
    ).rejects.toThrow(FK_VIOLATION)
  })

  it("pengguna A (sesi) juga ditolak saat mengantrekan item ke situs/batch B", async () => {
    await expect(
      asUser(db, a.userId, (tx) =>
        tx.query("insert into public.post_items (user_id, wp_site_id, target_keyword) values ($1, $2, 'kw')", [
          a.userId,
          b.siteId,
        ])
      )
    ).rejects.toThrow(FK_VIOLATION)
    await expect(
      asUser(db, a.userId, (tx) =>
        tx.query(
          "insert into public.post_items (user_id, wp_site_id, batch_id, target_keyword) values ($1, $2, $3, 'kw')",
          [a.userId, a.siteId, b.batchId]
        )
      )
    ).rejects.toThrow(FK_VIOLATION)
  })

  it("worker tidak dapat memindahkan item A ke situs B lewat UPDATE", async () => {
    await expect(
      asServiceRole(db, (tx) => tx.query("update public.post_items set wp_site_id = $1 where id = $2", [b.siteId, a.postId]))
    ).rejects.toThrow(FK_VIOLATION)
  })

  it.each([
    {
      name: "content_batches → wp_sites",
      sql: "insert into public.content_batches (user_id, wp_site_id, name) values ($1, $2, 'x')",
      params: () => [a.userId, b.siteId],
    },
    {
      name: "execution_logs → post_items",
      sql: "insert into public.execution_logs (post_item_id, user_id, step, message) values ($2, $1, 'queue', 'x')",
      params: () => [a.userId, b.postId],
    },
    {
      name: "agent_runs → post_items",
      sql: "insert into public.agent_runs (post_item_id, user_id, profile_ref, status) values ($2, $1, 'preset:x', 'running')",
      params: () => [a.userId, b.postId],
    },
    {
      name: "uploaded_media → wp_sites",
      sql: `insert into public.uploaded_media (user_id, site_id, source_url, site_url, image_id)
            values ($1, $2, 'https://img.example.test/x.jpg', 'https://s.example.test/x.jpg', 1)`,
      params: () => [a.userId, b.siteId],
    },
    {
      name: "uploaded_media → post_items",
      sql: `insert into public.uploaded_media (user_id, site_id, post_id, source_url, site_url, image_id)
            values ($1, $2, $3, 'https://img.example.test/y.jpg', 'https://s.example.test/y.jpg', 1)`,
      params: () => [a.userId, a.siteId, b.postId],
    },
  ])("$name menolak rujukan lintas tenant", async ({ sql, params }) => {
    await expect(asServiceRole(db, (tx) => tx.query(sql, params()))).rejects.toThrow(FK_VIOLATION)
  })
})

describe("post_items: state machine", () => {
  it("menerima tepat 9 state PRD §4", async () => {
    for (const state of POST_ITEM_STATES) {
      const result = await asServiceRole(db, (tx) =>
        tx.query("insert into public.post_items (user_id, wp_site_id, target_keyword, state) values ($1, $2, $3, $4)", [
          a.userId,
          a.siteId,
          `kw-${state}`,
          state,
        ])
      )
      expect(result.affectedRows).toBe(1)
    }
  })

  it.each(["published", "draft", "completed", ""])("menolak state tidak dikenal %j", async (state) => {
    await expect(
      asServiceRole(db, (tx) =>
        tx.query("update public.post_items set state = $1 where id = $2", [state, a.postId])
      )
    ).rejects.toThrow(CHECK_VIOLATION)
  })

  it("menolak wp_target_status di luar publish|future|draft dan retry_count negatif", async () => {
    await expect(
      asServiceRole(db, (tx) =>
        tx.query("update public.post_items set wp_target_status = 'private' where id = $1", [a.postId])
      )
    ).rejects.toThrow(CHECK_VIOLATION)
    await expect(
      asServiceRole(db, (tx) => tx.query("update public.post_items set retry_count = -1 where id = $1", [a.postId]))
    ).rejects.toThrow(CHECK_VIOLATION)
  })

  it("sesi pengguna hanya boleh mengantrekan item baru (queued_input tanpa naskah/wp_post_id)", async () => {
    const base = "insert into public.post_items (user_id, wp_site_id, target_keyword"
    await expect(
      asUser(db, a.userId, (tx) =>
        tx.query(`${base}, state) values ($1, $2, 'kw', 'ready_to_sync')`, [a.userId, a.siteId])
      )
    ).rejects.toThrow(RLS_VIOLATION)
    // Kolom naskah & wp_post_id tidak termasuk GRANT INSERT per kolom (migrasi queue_hardening).
    await expect(
      asUser(db, a.userId, (tx) =>
        tx.query(`${base}, content_html) values ($1, $2, 'kw', '<p>x</p>')`, [a.userId, a.siteId])
      )
    ).rejects.toThrow(PERMISSION_DENIED)
    await expect(
      asUser(db, a.userId, (tx) => tx.query(`${base}, wp_post_id) values ($1, $2, 'kw', 99)`, [a.userId, a.siteId]))
    ).rejects.toThrow(PERMISSION_DENIED)

    const queued = await asUser(db, a.userId, (tx) =>
      tx.query<{ state: string }>(
        `${base}, title, categories, tags, source_payload, wp_target_status)
         values ($1, $2, 'kw', 'Judul', '["Berita"]', '["tag"]', '{"agentProfileRef": "preset:quick-writer"}', 'publish')
         returning state`,
        [a.userId, a.siteId]
      )
    )
    expect(queued.rows[0]?.state).toBe("queued_input")
  })

  it("sesi pengguna tidak dapat mengubah kolom antrean miliknya (state, naskah, wp_post_id)", async () => {
    for (const assignment of ["state = 'published_on_wp'", "content_html = '<p>x</p>'", "wp_post_id = 1"]) {
      await expect(
        asUser(db, a.userId, (tx) => tx.query(`update public.post_items set ${assignment} where id = $1`, [a.postId]))
      ).rejects.toThrow(PERMISSION_DENIED)
    }
  })

  it("JSON payload wajib berbentuk benar", async () => {
    await expect(
      asServiceRole(db, (tx) => tx.query("update public.post_items set source_payload = '[]' where id = $1", [a.postId]))
    ).rejects.toThrow(CHECK_VIOLATION)
    await expect(
      asServiceRole(db, (tx) => tx.query("update public.post_items set tags = '{}' where id = $1", [a.postId]))
    ).rejects.toThrow(CHECK_VIOLATION)
  })
})

describe("enum & format lain", () => {
  it("execution_logs: level dibatasi info|warn|error, step teks bebas (node dinamis)", async () => {
    const insertLog = (step: string, level: string) =>
      asServiceRole(db, (tx) =>
        tx.query(
          "insert into public.execution_logs (post_item_id, user_id, step, level, message) values ($1, $2, $3, $4, 'm')",
          [a.postId, a.userId, step, level]
        )
      )
    for (const step of ["init_queue", "wordpress_publisher", "tool_call", "stale_recovery", "data_fix"]) {
      expect((await insertLog(step, "info")).affectedRows).toBe(1)
    }
    expect((await insertLog("prepare_sync", "warn")).affectedRows).toBe(1)
    await expect(insertLog("generation", "debug")).rejects.toThrow(CHECK_VIOLATION)
  })

  it("enum status/mode menolak nilai di luar yang ditulis kode", async () => {
    const cases: Array<[string, unknown[]]> = [
      ["update public.wp_sites set status = 'broken' where id = $1", [a.siteId]],
      ["update public.content_batches set status = 'done' where id = $1", [a.batchId]],
      ["update public.content_batches set execution_mode = 'instant' where id = $1", [a.batchId]],
      ["update public.agent_profiles set mode = 'turbo' where id = $1", [a.profileId]],
      ["update public.agent_runs set status = 'success' where id = $1", [a.runId]],
      ["update public.agent_skills set slug = 'Bukan Slug' where id = $1", [a.skillId]],
      ["update public.webhooks set events = '{}' where id = $1", [a.webhookId]],
    ]
    for (const [sql, params] of cases) {
      await expect(asServiceRole(db, (tx) => tx.query(sql, params))).rejects.toThrow(CHECK_VIOLATION)
    }
  })
})

describe("UNIQUE", () => {
  it("wp_sites: base_url unik per tenant, boleh sama antar tenant", async () => {
    const baseUrl = await db.query<{ base_url: string }>("select base_url from public.wp_sites where id = $1", [a.siteId])
    const url = baseUrl.rows[0]?.base_url
    const insertSite = (userId: string) =>
      asUser(db, userId, (tx) =>
        tx.query(
          `insert into public.wp_sites (user_id, site_name, base_url, wp_username, encrypted_app_password)
           values ($1, 'Duplikat', $2, 'editor', 'iv:tag:cipher')`,
          [userId, url]
        )
      )
    await expect(insertSite(a.userId)).rejects.toThrow(UNIQUE_VIOLATION)
    expect((await insertSite(b.userId)).affectedRows).toBe(1)
  })

  it("agent_skills: slug unik per tenant; boleh sama dengan tenant lain & skill sistem", async () => {
    const insertSkill = (userId: string, slug: string) =>
      asUser(db, userId, (tx) =>
        tx.query("insert into public.agent_skills (user_id, name, slug, content) values ($1, 'Skill', $2, 'isi')", [
          userId,
          slug,
        ])
      )
    await expect(insertSkill(a.userId, "gaya-brand")).rejects.toThrow(UNIQUE_VIOLATION)
    expect((await insertSkill(a.userId, "anti-ai-editor")).affectedRows).toBe(1)

    await expect(
      asServiceRole(db, (tx) =>
        tx.query(
          "insert into public.agent_skills (name, slug, content, is_system) values ('Duplikat', 'anti-ai-editor', 'x', true)"
        )
      )
    ).rejects.toThrow(UNIQUE_VIOLATION)
  })

  it("agent_skills: skill sistem tanpa pemilik, skill tenant wajib punya pemilik", async () => {
    await expect(
      asServiceRole(db, (tx) =>
        tx.query("insert into public.agent_skills (user_id, name, slug, content, is_system) values ($1, 'S', 's', 'x', true)", [
          a.userId,
        ])
      )
    ).rejects.toThrow(CHECK_VIOLATION)
    await expect(
      asServiceRole(db, (tx) =>
        tx.query("insert into public.agent_skills (name, slug, content, is_system) values ('S', 'yatim', 'x', false)")
      )
    ).rejects.toThrow(CHECK_VIOLATION)
  })

  it("user_settings: satu baris per pengguna", async () => {
    await expect(
      asServiceRole(db, (tx) => tx.query("insert into public.user_settings (user_id) values ($1)", [a.userId]))
    ).rejects.toThrow(UNIQUE_VIOLATION)
  })
})

describe("trigger updated_at", () => {
  it("diperbarui otomatis untuk update via worker maupun sesi pengguna", async () => {
    const past = "2020-01-01T00:00:00Z"
    // Mundurkan updated_at tanpa memicu trigger, lalu ubah baris lewat jalur aplikasi.
    await db.exec(`
      alter table public.wp_sites disable trigger set_updated_at;
      alter table public.post_items disable trigger set_updated_at;
    `)
    await db.query("update public.wp_sites set updated_at = $1 where id = $2", [past, a.siteId])
    await db.query("update public.post_items set updated_at = $1 where id = $2", [past, a.postId])
    await db.exec(`
      alter table public.wp_sites enable trigger set_updated_at;
      alter table public.post_items enable trigger set_updated_at;
    `)

    await asUser(db, a.userId, (tx) =>
      tx.query("update public.wp_sites set site_name = 'Nama baru' where id = $1", [a.siteId])
    )
    await asServiceRole(db, (tx) =>
      tx.query("update public.post_items set retry_count = retry_count + 1 where id = $1", [a.postId])
    )

    const result = await db.query<{ site: boolean; post: boolean }>(
      `select
         (select updated_at > $1::timestamptz from public.wp_sites where id = $2) as site,
         (select updated_at > $1::timestamptz from public.post_items where id = $3) as post`,
      [past, a.siteId, a.postId]
    )
    expect(result.rows[0]).toEqual({ site: true, post: true })
  })
})

describe("ON DELETE", () => {
  let c: TenantFixture

  beforeAll(async () => {
    c = await seedTenant(db, "tenant-c")
  })

  it("hapus item oleh pemilik: log & agent_runs ikut terhapus, uploaded_media.post_id dikosongkan", async () => {
    const deleted = await asUser(db, c.userId, (tx) => tx.query("delete from public.post_items where id = $1", [c.postId]))
    expect(deleted.affectedRows).toBe(1)
    expect(await countRows(db, "execution_logs", c.logId)).toBe(0)
    expect(await countRows(db, "agent_runs", c.runId)).toBe(0)
    const media = await db.query<{ post_id: string | null; user_id: string }>(
      "select post_id, user_id from public.uploaded_media where id = $1",
      [c.mediaId]
    )
    expect(media.rows[0]).toEqual({ post_id: null, user_id: c.userId })
  })

  it("hapus batch: item tetap ada dengan batch_id null (user_id tidak tersentuh)", async () => {
    const postId = await db
      .query<{ id: string }>(
        "insert into public.post_items (user_id, wp_site_id, batch_id, target_keyword) values ($1, $2, $3, 'kw') returning id",
        [c.userId, c.siteId, c.batchId]
      )
      .then((r) => r.rows[0]?.id)
    await asUser(db, c.userId, (tx) => tx.query("delete from public.content_batches where id = $1", [c.batchId]))
    const item = await db.query<{ batch_id: string | null; user_id: string }>(
      "select batch_id, user_id from public.post_items where id = $1",
      [postId]
    )
    expect(item.rows[0]).toEqual({ batch_id: null, user_id: c.userId })
  })

  it("hapus situs: batch, item, dan media situs ikut terhapus", async () => {
    await asUser(db, c.userId, (tx) => tx.query("delete from public.wp_sites where id = $1", [c.siteId]))
    const remaining = await db.query<{ n: number }>(
      `select (select count(*) from public.post_items where wp_site_id = $1)
            + (select count(*) from public.content_batches where wp_site_id = $1)
            + (select count(*) from public.uploaded_media where site_id = $1) as n`,
      [c.siteId]
    )
    expect(Number(remaining.rows[0]?.n)).toBe(0)
  })

  it("hapus akun auth.users: seluruh data tenant terhapus", async () => {
    const fixture = await seedTenant(db, "dihapus")
    await db.query("delete from auth.users where id = $1", [fixture.userId])
    for (const table of APP_TABLES) {
      const left = await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where user_id = $1`, [
        fixture.userId,
      ])
      expect(left.rows[0]?.n, table).toBe(0)
    }
  })
})
