/**
 * Rencana kata kunci Tulis Niche (migrasi `*_niche_keyword_plan.sql`): RPC `assign_niche_keywords` khusus
 * service_role yang dipagari token klaim + `generating_content`, penulis pertama menang (rencana kedua
 * dibuang), pengisian `target_keyword` kosong per `slot_index`, validasi masukan, dan isolasi tenant.
 */
import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { asServiceRole, asUser, createTestDb, PERMISSION_DENIED, seedTenant, type TenantFixture } from "./helpers/test-db"

const TOKEN = "runner-uji:0123456789abcdef0123456789abcdef"
const ASSIGN_SQL = "select public.assign_niche_keywords($1, $2, $3::text[]) as plan"
const INVALID_INPUT = /assign_niche_keywords: /

let db: PGlite
let a: TenantFixture
let b: TenantFixture

beforeAll(async () => {
  db = await createTestDb()
  a = await seedTenant(db, "niche-a")
  b = await seedTenant(db, "niche-b")
}, 60_000)

afterAll(async () => {
  await db.close()
})

interface NicheBatch {
  batchId: string
  /** ID item urut `slot_index`. */
  itemIds: string[]
}

/** Batch Tulis Niche milik `tenant` dengan `count` item berkata kunci kosong (slot 0..count-1). */
async function nicheBatch(tenant: TenantFixture, count: number, sourceType = "niche_auto"): Promise<NicheBatch> {
  const batch = await db.query<{ id: string }>(
    `insert into public.content_batches (user_id, wp_site_id, name, source_type, status, total_items, ai_config)
     values ($1, $2, 'Niche: kopi', $3, 'running', $4, '{"niche":"kopi"}'::jsonb) returning id`,
    [tenant.userId, tenant.siteId, sourceType, count]
  )
  const batchId = batch.rows[0].id
  const items = await db.query<{ id: string }>(
    `insert into public.post_items (user_id, wp_site_id, batch_id, target_keyword, state, source_payload)
     select $1, $2, $3, '', 'queued_input', jsonb_build_object('keyword_source', 'niche_auto', 'slot_index', i)
     from generate_series(0, $4 - 1) as i
     order by i
     returning id`,
    [tenant.userId, tenant.siteId, batchId, count]
  )
  return { batchId, itemIds: items.rows.map((row) => row.id) }
}

/** Klaim worker atas satu item (generating_content + lease bertoken). */
async function claim(postId: string, token = TOKEN, state = "generating_content"): Promise<void> {
  await db.query(
    "update public.post_items set state = $2, locked_by = $3, locked_until = now() + interval '15 minutes' where id = $1",
    [postId, state, token]
  )
}

async function assign(postId: string, keywords: unknown, token = TOKEN): Promise<string[] | null> {
  const result = await asServiceRole(db, (tx) => tx.query<{ plan: string[] | null }>(ASSIGN_SQL, [postId, token, keywords]))
  return result.rows[0].plan
}

async function keywordsOf(batch: NicheBatch): Promise<string[]> {
  const result = await db.query<{ target_keyword: string }>(
    `select target_keyword from public.post_items where batch_id = $1 order by (source_payload ->> 'slot_index')::int`,
    [batch.batchId]
  )
  return result.rows.map((row) => row.target_keyword)
}

async function storedPlan(batchId: string): Promise<unknown> {
  const result = await db.query<{ plan: unknown }>(
    "select ai_config -> 'niche_keywords' as plan from public.content_batches where id = $1",
    [batchId]
  )
  return result.rows[0].plan
}

describe("assign_niche_keywords — rencana batch", () => {
  it("menyimpan rencana ke ai_config dan mengisi kata kunci seluruh item sesuai slot_index", async () => {
    const batch = await nicheBatch(a, 3)
    await claim(batch.itemIds[1])

    expect(await assign(batch.itemIds[1], ["kopi arabika", "kopi robusta", "cara seduh v60"])).toEqual([
      "kopi arabika",
      "kopi robusta",
      "cara seduh v60",
    ])

    expect(await storedPlan(batch.batchId)).toEqual(["kopi arabika", "kopi robusta", "cara seduh v60"])
    expect(await keywordsOf(batch)).toEqual(["kopi arabika", "kopi robusta", "cara seduh v60"])
    const config = await db.query<{ niche: string }>("select ai_config ->> 'niche' as niche from public.content_batches where id = $1", [
      batch.batchId,
    ])
    expect(config.rows[0].niche).toBe("kopi")
  })

  it("penulis pertama menang: klaim lain menerima rencana tersimpan, rencananya sendiri dibuang", async () => {
    const batch = await nicheBatch(a, 2)
    await claim(batch.itemIds[0], "runner-1:aaaa")
    await claim(batch.itemIds[1], "runner-2:bbbb")

    expect(await assign(batch.itemIds[0], ["teh hijau", "teh hitam"], "runner-1:aaaa")).toEqual(["teh hijau", "teh hitam"])
    expect(await assign(batch.itemIds[1], ["matcha", "oolong"], "runner-2:bbbb")).toEqual(["teh hijau", "teh hitam"])

    expect(await storedPlan(batch.batchId)).toEqual(["teh hijau", "teh hitam"])
    expect(await keywordsOf(batch)).toEqual(["teh hijau", "teh hitam"])
  })

  it("hanya kata kunci kosong yang diisi; slot di luar rencana atau tidak valid dibiarkan", async () => {
    const batch = await nicheBatch(a, 3)
    await db.query("update public.post_items set target_keyword = 'sudah ada' where id = $1", [batch.itemIds[0]])
    await db.query(`update public.post_items set source_payload = '{"slot_index":"x"}'::jsonb where id = $1`, [batch.itemIds[2]])
    await claim(batch.itemIds[1])

    expect(await assign(batch.itemIds[1], ["satu", "  dua  "])).toEqual(["satu", "  dua  "])

    const rows = await db.query<{ id: string; target_keyword: string }>(
      "select id, target_keyword from public.post_items where batch_id = $1",
      [batch.batchId]
    )
    const byId = Object.fromEntries(rows.rows.map((row) => [row.id, row.target_keyword]))
    expect(byId[batch.itemIds[0]]).toBe("sudah ada")
    expect(byId[batch.itemIds[1]]).toBe("dua")
    expect(byId[batch.itemIds[2]]).toBe("")
  })

  it.each([
    ["token klaim lain (run basi)", "runner-lain:ffff", "generating_content"],
    ["state bukan generating_content", TOKEN, "queued_input"],
  ])("pagar klaim: %s → NULL tanpa menulis", async (_label, token, state) => {
    const batch = await nicheBatch(a, 1)
    await claim(batch.itemIds[0], token, state)

    expect(await assign(batch.itemIds[0], ["kopi susu"])).toBeNull()

    expect(await storedPlan(batch.batchId)).toBeNull()
    expect(await keywordsOf(batch)).toEqual([""])
  })

  it("batch bukan Tulis Niche atau item tanpa batch → NULL", async () => {
    const manual = await nicheBatch(a, 1, "manual")
    await claim(manual.itemIds[0])
    expect(await assign(manual.itemIds[0], ["kopi"])).toBeNull()
    expect(await storedPlan(manual.batchId)).toBeNull()

    const loose = await db.query<{ id: string }>(
      `insert into public.post_items (user_id, wp_site_id, target_keyword, state, locked_by, locked_until)
       values ($1, $2, '', 'generating_content', $3, now() + interval '15 minutes') returning id`,
      [a.userId, a.siteId, TOKEN]
    )
    expect(await assign(loose.rows[0].id, ["kopi"])).toBeNull()
  })

  it("batch Tulis Niche lain (tenant lain) tidak tersentuh", async () => {
    const batch = await nicheBatch(a, 2)
    const foreign = await nicheBatch(b, 1)
    await claim(batch.itemIds[0])

    await assign(batch.itemIds[0], ["a1", "a2"])

    expect(await keywordsOf(foreign)).toEqual([""])
    expect(await storedPlan(foreign.batchId)).toBeNull()
  })

  it.each([
    ["kosong", []],
    ["elemen kosong", ["kopi", "   "]],
    ["elemen null", ["kopi", null]],
    ["terlalu panjang", ["k".repeat(301)]],
    ["lebih dari 100", Array.from({ length: 101 }, (_, index) => `kw ${index}`)],
  ])("masukan tidak valid (%s) ditolak", async (_label, keywords) => {
    const batch = await nicheBatch(a, 1)
    await claim(batch.itemIds[0])
    await expect(assign(batch.itemIds[0], keywords)).rejects.toThrow(INVALID_INPUT)
    expect(await storedPlan(batch.batchId)).toBeNull()
  })

  it("parameter klaim wajib", async () => {
    const batch = await nicheBatch(a, 1)
    await expect(assign(batch.itemIds[0], ["kopi"], "  ")).rejects.toThrow(INVALID_INPUT)
  })
})

describe("assign_niche_keywords — hak akses", () => {
  it("authenticated & anon tidak dapat memanggil RPC", async () => {
    const batch = await nicheBatch(a, 1)
    await claim(batch.itemIds[0])
    await expect(
      asUser(db, a.userId, (tx) => tx.query(ASSIGN_SQL, [batch.itemIds[0], TOKEN, ["kopi"]]))
    ).rejects.toThrow(PERMISSION_DENIED)
    for (const role of ["anon", "authenticated"]) {
      const result = await db.query<{ allowed: boolean }>(
        "select has_function_privilege($1, 'public.assign_niche_keywords(uuid, text, text[])', 'EXECUTE') as allowed",
        [role]
      )
      expect(result.rows[0].allowed).toBe(false)
    }
  })
})
