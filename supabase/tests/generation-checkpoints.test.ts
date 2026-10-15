/**
 * Checkpoint generasi (migrasi `*_generation_checkpoints.sql`): RLS (tenant hanya membaca barisnya),
 * RPC `save_generation_checkpoint` khusus service_role yang dipagari token klaim + state
 * `generating_content`, batas ukuran & bentuk data, cascade saat item dihapus, dan kolom metrik
 * baru `agent_runs`.
 */
import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  asAnon,
  asServiceRole,
  asUser,
  CHECK_VIOLATION,
  createTestDb,
  FK_VIOLATION,
  PERMISSION_DENIED,
  seedTenant,
  type TenantFixture,
} from "./helpers/test-db"

const TOKEN = "runner-uji:0123456789abcdef0123456789abcdef"
const SAVE_SQL = "select public.save_generation_checkpoint($1, $2, $3, $4, $5::jsonb, $6::jsonb) as saved"

let db: PGlite
let a: TenantFixture
let b: TenantFixture

beforeAll(async () => {
  db = await createTestDb()
  a = await seedTenant(db, "ckpt-a")
  b = await seedTenant(db, "ckpt-b")
}, 60_000)

afterAll(async () => {
  await db.close()
})

/** Item baru milik `tenant` yang sedang diklaim worker (generating_content + lease bertoken). */
async function claimedItem(tenant: TenantFixture, state = "generating_content", token = TOKEN): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into public.post_items (user_id, wp_site_id, target_keyword, state, locked_by, locked_until)
     values ($1, $2, 'kopi', $3, $4, now() + interval '15 minutes') returning id`,
    [tenant.userId, tenant.siteId, state, token]
  )
  return result.rows[0].id
}

async function save(
  postId: string,
  options: { token?: string; step?: string; version?: number; data?: unknown; promptVersions?: unknown } = {}
): Promise<boolean> {
  const result = await asServiceRole(db, (tx) =>
    tx.query<{ saved: boolean }>(SAVE_SQL, [
      postId,
      options.token ?? TOKEN,
      options.step ?? "pre_resolve",
      options.version ?? 1,
      JSON.stringify(options.data ?? { inputKey: "k1" }),
      JSON.stringify(options.promptVersions ?? { "system-resolve-taxonomy-author": "abc123def456" }),
    ])
  )
  return result.rows[0].saved
}

async function checkpointsOf(postId: string) {
  const result = await db.query<{ step: string; user_id: string; schema_version: number; data: unknown; prompt_versions: unknown }>(
    "select step, user_id, schema_version, data, prompt_versions from public.generation_checkpoints where post_item_id = $1 order by step",
    [postId]
  )
  return result.rows
}

describe("save_generation_checkpoint — pagar klaim", () => {
  it("menyimpan checkpoint untuk pemegang token pada generating_content; pemilik diambil dari item", async () => {
    const postId = await claimedItem(a)

    expect(await save(postId)).toBe(true)

    expect(await checkpointsOf(postId)).toEqual([
      {
        step: "pre_resolve",
        user_id: a.userId,
        schema_version: 1,
        data: { inputKey: "k1" },
        prompt_versions: { "system-resolve-taxonomy-author": "abc123def456" },
      },
    ])
  })

  it("upsert per (item, langkah): data & versi skema diganti, updated_at bergerak, langkah lain tetap", async () => {
    const postId = await claimedItem(a)
    await save(postId, { data: { inputKey: "lama" } })
    await save(postId, { step: "draft", data: { inputKey: "draft-1" } })
    const stamps = async () =>
      Object.fromEntries(
        (
          await db.query<{ step: string; updated_at: string }>(
            "select step, updated_at::text from public.generation_checkpoints where post_item_id = $1",
            [postId]
          )
        ).rows.map((row) => [row.step, row.updated_at])
      )
    const before = await stamps()
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(await save(postId, { version: 2, data: { inputKey: "baru" } })).toBe(true)

    const after = await stamps()
    expect(after.draft).toBe(before.draft)
    expect(after.pre_resolve > before.pre_resolve).toBe(true)
    expect((await checkpointsOf(postId)).map(({ step, schema_version, data }) => ({ step, schema_version, data }))).toEqual([
      { step: "draft", schema_version: 1, data: { inputKey: "draft-1" } },
      { step: "pre_resolve", schema_version: 2, data: { inputKey: "baru" } },
    ])
  })

  it.each([
    ["token klaim lain (run basi setelah item diklaim ulang)", "generating_content", "runner-lain:ffff"],
    ["state bukan generating_content (naskah sudah tersimpan)", "syncing_to_wp", TOKEN],
    ["item dikembalikan ke antrean (lease dilepas)", "queued_input", null],
  ])("ditolak (false) tanpa menulis: %s", async (_label, state, lockedBy) => {
    const postId = await claimedItem(a, state, lockedBy ?? TOKEN)
    if (lockedBy === null) {
      await db.query("update public.post_items set locked_by = null, locked_until = null where id = $1", [postId])
    }

    expect(await save(postId)).toBe(false)
    expect(await checkpointsOf(postId)).toEqual([])
  })

  it("checkpoint lama tidak dapat ditimpa run basi setelah klaim berpindah", async () => {
    const postId = await claimedItem(a)
    await save(postId, { data: { inputKey: "klaim-1" } })
    // Auto-healing memulihkan item lalu claim_post_items memberi token baru.
    await db.query("update public.post_items set locked_by = 'runner-baru:aaaa' where id = $1", [postId])

    expect(await save(postId, { data: { inputKey: "basi" } })).toBe(false)
    expect(await save(postId, { token: "runner-baru:aaaa", step: "draft", data: { inputKey: "klaim-2" } })).toBe(true)
    expect((await checkpointsOf(postId)).map((row) => row.data)).toEqual([{ inputKey: "klaim-2" }, { inputKey: "klaim-1" }])
  })

  it("item tidak ada → false; token kosong → error validasi", async () => {
    expect(await save("00000000-0000-4000-8000-000000000000")).toBe(false)
    const postId = await claimedItem(a)
    await expect(save(postId, { token: "  " })).rejects.toThrow(/p_lease_token wajib diisi/)
  })

  it("langkah tak dikenal, versi skema, data bukan objek, dan prompt_versions bukan objek ditolak CHECK", async () => {
    const postId = await claimedItem(a)
    await expect(save(postId, { step: "agent_loop" })).rejects.toThrow(CHECK_VIOLATION)
    await expect(save(postId, { version: 0 })).rejects.toThrow(CHECK_VIOLATION)
    await expect(save(postId, { data: ["bukan", "objek"] })).rejects.toThrow(CHECK_VIOLATION)
    await expect(save(postId, { promptVersions: ["x"] })).rejects.toThrow(CHECK_VIOLATION)
    expect(await checkpointsOf(postId)).toEqual([])
  })

  it("batas ukuran data 256 KiB (naskah puluhan KB tetap muat)", async () => {
    const postId = await claimedItem(a)
    const draft = { inputKey: "k", output: { markdownContent: "kata ".repeat(16_000) } }
    expect(await save(postId, { step: "draft", data: draft })).toBe(true)

    await expect(save(postId, { step: "draft", data: { blob: "x".repeat(262_144) } })).rejects.toThrow(CHECK_VIOLATION)
    expect((await checkpointsOf(postId))[0]?.data).toEqual(draft)
  })
})

describe("hak akses", () => {
  it("RPC hanya dapat dieksekusi service_role", async () => {
    const postId = await claimedItem(a)
    const params = [postId, TOKEN, "pre_resolve", 1, "{}", "{}"]
    await expect(asUser(db, a.userId, (tx) => tx.query(SAVE_SQL, params))).rejects.toThrow(PERMISSION_DENIED)
    await expect(asAnon(db, (tx) => tx.query(SAVE_SQL, params))).rejects.toThrow(PERMISSION_DENIED)

    const privileges = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>(
      `select has_function_privilege('anon', $1, 'execute') as anon,
              has_function_privilege('authenticated', $1, 'execute') as authenticated,
              has_function_privilege('service_role', $1, 'execute') as service`,
      ["public.save_generation_checkpoint(uuid, text, text, integer, jsonb, jsonb)"]
    )
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: false, service: true })
  })

  it("tenant membaca checkpoint miliknya (dasbor), tidak milik tenant lain", async () => {
    const own = await asUser(db, a.userId, (tx) =>
      tx.query<{ id: string }>("select id from public.generation_checkpoints where post_item_id = $1", [a.postId])
    )
    expect(own.rows.map((row) => row.id)).toEqual([a.checkpointId])

    const foreign = await asUser(db, a.userId, (tx) =>
      tx.query("select id from public.generation_checkpoints where post_item_id = $1", [b.postId])
    )
    expect(foreign.rows).toEqual([])
  })

  it("tenant tidak dapat menyisipkan, mengubah, atau menghapus checkpoint — termasuk miliknya sendiri", async () => {
    await expect(
      asUser(db, a.userId, (tx) =>
        tx.query(
          `insert into public.generation_checkpoints (post_item_id, user_id, step, schema_version, data)
           values ($1, $2, 'draft', 1, '{}')`,
          [a.postId, a.userId]
        )
      )
    ).rejects.toThrow(PERMISSION_DENIED)
    await expect(
      asUser(db, a.userId, (tx) =>
        tx.query(`update public.generation_checkpoints set data = '{"x": 1}' where id = $1`, [a.checkpointId])
      )
    ).rejects.toThrow(PERMISSION_DENIED)
    await expect(
      asUser(db, a.userId, (tx) => tx.query("delete from public.generation_checkpoints where id = $1", [a.checkpointId]))
    ).rejects.toThrow(PERMISSION_DENIED)
  })

  it("FK komposit: checkpoint tidak dapat menunjuk item milik tenant lain, bahkan via service_role", async () => {
    await expect(
      asServiceRole(db, (tx) =>
        tx.query(
          `insert into public.generation_checkpoints (post_item_id, user_id, step, schema_version, data)
           values ($1, $2, 'draft', 1, '{}')`,
          [b.postId, a.userId]
        )
      )
    ).rejects.toThrow(FK_VIOLATION)
  })
})

describe("siklus hidup", () => {
  it("checkpoint ikut terhapus saat item dihapus pemiliknya", async () => {
    const postId = await claimedItem(a)
    await save(postId)
    await save(postId, { step: "draft" })

    await asUser(db, a.userId, (tx) => tx.query("delete from public.post_items where id = $1", [postId]))

    expect(await checkpointsOf(postId)).toEqual([])
  })

  it("worker (service_role) dapat menghapus checkpoint setelah naskah tersimpan", async () => {
    const postId = await claimedItem(a)
    await save(postId)
    const deleted = await asServiceRole(db, (tx) =>
      tx.query("delete from public.generation_checkpoints where post_item_id = $1 and user_id = $2", [postId, a.userId])
    )
    expect(deleted.affectedRows).toBe(1)
  })
})

describe("agent_runs — metrik run", () => {
  it("baris lama mendapat default netral; tenant dapat membaca metrik barunya", async () => {
    const row = await asUser(db, a.userId, (tx) =>
      tx.query<Record<string, unknown>>(
        `select model, llm_calls, tokens_total, cost_usd, model_usage, prompt_versions, resumed_steps
         from public.agent_runs where id = $1`,
        [a.runId]
      )
    )
    expect(row.rows[0]).toEqual({
      model: null,
      llm_calls: 0,
      tokens_total: null,
      cost_usd: null,
      model_usage: [],
      prompt_versions: {},
      resumed_steps: [],
    })
  })

  it("worker menulis metrik lengkap; biaya numeric(12,6)", async () => {
    await asServiceRole(db, (tx) =>
      tx.query(
        `update public.agent_runs
         set model = 'acme/model', llm_calls = 3, tokens_total = 1234, cost_usd = 0.0123456,
             model_usage = $2::jsonb, prompt_versions = $3::jsonb, resumed_steps = array['pre_resolve']
         where id = $1`,
        [a.runId, JSON.stringify([{ model: "acme/model", calls: 3 }]), JSON.stringify({ "agent-quick-writer": "abc" })]
      )
    )
    const row = await db.query<{ cost_usd: string; resumed_steps: string[] }>(
      "select cost_usd::text, resumed_steps from public.agent_runs where id = $1",
      [a.runId]
    )
    expect(row.rows[0]).toEqual({ cost_usd: "0.012346", resumed_steps: ["pre_resolve"] })
  })

  it.each([
    ["llm_calls negatif", "llm_calls = -1"],
    ["tokens_total negatif", "tokens_total = -5"],
    ["biaya negatif", "cost_usd = -0.01"],
    ["model_usage bukan array", `model_usage = '{}'::jsonb`],
    ["prompt_versions bukan objek", `prompt_versions = '[]'::jsonb`],
    ["langkah resume tak dikenal", "resumed_steps = array['agent_loop']"],
    ["model kosong", "model = ''"],
  ])("CHECK menolak %s", async (_label, assignment) => {
    await expect(
      asServiceRole(db, (tx) => tx.query(`update public.agent_runs set ${assignment} where id = $1`, [b.runId]))
    ).rejects.toThrow(CHECK_VIOLATION)
  })
})
