/**
 * Lease antrean (migrasi `*_queue_leases.sql`): klaim atomik `claim_post_items` (jatuh tempo,
 * jadwal drip, backoff, batas konkurensi per situs, filter tenant, keadilan antar tenant),
 * heartbeat `extend_post_item_lease`, constraint pasangan lease, dan hak akses RPC.
 */
import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  asAnon,
  asServiceRole,
  asUser,
  CHECK_VIOLATION,
  createTestDb,
  createUser,
  PERMISSION_DENIED,
  RLS_VIOLATION,
} from "./helpers/test-db"

const WORKER = "worker-test-1"
const LEASE_SECONDS = 900

let db: PGlite

interface Tenant {
  userId: string
  siteId: string
}

interface ClaimedRow {
  id: string
  state: string
  locked_by: string | null
  locked_until: string | null
  next_attempt_at: string | null
}

beforeAll(async () => {
  db = await createTestDb()
}, 60_000)

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec("delete from public.post_items; delete from public.content_batches;")
})

async function createTenant(label: string, maxConcurrency = 2): Promise<Tenant> {
  const userId = await createUser(db, label)
  const site = await db.query<{ id: string }>(
    `insert into public.wp_sites (user_id, site_name, base_url, wp_username, encrypted_app_password, max_concurrency)
     values ($1, $2, $3, 'editor', 'iv:tag:cipher', $4) returning id`,
    [userId, `Situs ${label}`, `https://${label}-${userId.slice(0, 8)}.example.test`, maxConcurrency]
  )
  return { userId, siteId: site.rows[0].id }
}

async function addSite(tenant: Tenant, maxConcurrency = 2): Promise<string> {
  const site = await db.query<{ id: string }>(
    `insert into public.wp_sites (user_id, site_name, base_url, wp_username, encrypted_app_password, max_concurrency)
     values ($1, 'Situs tambahan', $2, 'editor', 'iv:tag:cipher', $3) returning id`,
    [tenant.userId, `https://extra-${Math.random().toString(36).slice(2)}.example.test`, maxConcurrency]
  )
  return site.rows[0].id
}

async function createBatch(tenant: Tenant, executionMode: "immediate" | "scheduled_drip"): Promise<string> {
  const batch = await db.query<{ id: string }>(
    `insert into public.content_batches (user_id, wp_site_id, name, execution_mode, status)
     values ($1, $2, 'Batch uji', $3, 'running') returning id`,
    [tenant.userId, tenant.siteId, executionMode]
  )
  return batch.rows[0].id
}

interface ItemOptions {
  siteId?: string
  state?: string
  batchId?: string | null
  /** Ekspresi SQL relatif terhadap now(), mis. "now() + interval '1 hour'". */
  scheduledFor?: string
  nextAttemptAt?: string
  lockedUntil?: string
  lockedBy?: string
  createdAt?: string
  content?: boolean
}

async function addItem(tenant: Tenant, options: ItemOptions = {}): Promise<string> {
  const content = options.content ?? options.state === "ready_to_sync"
  const result = await db.query<{ id: string }>(
    `insert into public.post_items (user_id, wp_site_id, batch_id, target_keyword, state, title, content_html,
       scheduled_for, next_attempt_at, locked_until, locked_by, created_at)
     values ($1, $2, $3, 'kata kunci', $4, $5, $6,
       ${options.scheduledFor ?? "null"}, ${options.nextAttemptAt ?? "null"}, ${options.lockedUntil ?? "null"},
       $7, ${options.createdAt ?? "now()"})
     returning id`,
    [
      tenant.userId,
      options.siteId ?? tenant.siteId,
      options.batchId ?? null,
      options.state ?? "queued_input",
      content ? "Judul" : null,
      content ? "<p>isi</p>" : null,
      options.lockedBy ?? (options.lockedUntil ? "worker-lain" : null),
    ]
  )
  return result.rows[0].id
}

async function claim(limit: number, userId: string | null = null, worker = WORKER): Promise<ClaimedRow[]> {
  return asServiceRole(db, async (tx) => {
    const result = await tx.query<ClaimedRow>(
      `select id, state, locked_by, locked_until::text, next_attempt_at::text
       from public.claim_post_items($1, $2, $3, $4)`,
      [worker, limit, LEASE_SECONDS, userId]
    )
    return result.rows
  })
}

const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort()

describe("claim_post_items — transisi & lease", () => {
  it("queued_input → generating_content dan ready_to_sync → syncing_to_wp dengan lease worker", async () => {
    const t = await createTenant("transisi", 5)
    const queued = await addItem(t)
    const ready = await addItem(t, { state: "ready_to_sync", nextAttemptAt: "now() - interval '1 minute'" })

    const rows = await claim(10)

    expect(Object.fromEntries(rows.map((row) => [row.id, row.state]))).toEqual({
      [queued]: "generating_content",
      [ready]: "syncing_to_wp",
    })
    for (const row of rows) {
      expect(row.locked_by).toBe(WORKER)
      expect(row.next_attempt_at).toBeNull()
    }
    const lease = await db.query<{ ok: boolean }>(
      `select bool_and(locked_until between now() + interval '899 seconds' and now() + interval '901 seconds') as ok
       from public.post_items where id = any($1::uuid[])`,
      [[queued, ready]]
    )
    expect(lease.rows[0].ok).toBe(true)

    expect(await claim(10)).toEqual([])
  })

  it("state lain (in-flight, gagal, final) tidak pernah diklaim", async () => {
    const t = await createTenant("state-lain", 10)
    for (const state of ["failed_generation", "failed_sync", "published_on_wp", "saved_draft_on_wp", "scheduled_on_wp"]) {
      await addItem(t, { state })
    }
    await addItem(t, { state: "generating_content", lockedUntil: "now() - interval '1 hour'" })

    expect(await claim(10)).toEqual([])
  })

  it("p_limit dihormati; p_limit < 1 tidak mengklaim apa pun", async () => {
    const t = await createTenant("limit", 10)
    for (let i = 0; i < 4; i++) await addItem(t, { createdAt: `now() - interval '${10 - i} minutes'` })

    expect(await claim(0)).toEqual([])
    expect(await claim(3)).toHaveLength(3)
    expect(await claim(3)).toHaveLength(1)
  })

  it("menolak worker kosong dan lease terlalu pendek", async () => {
    await expect(claim(1, null, " ")).rejects.toThrow(/p_worker wajib diisi/)
    await expect(
      asServiceRole(db, (tx) => tx.query("select * from public.claim_post_items('w', 1, 5)"))
    ).rejects.toThrow(/p_lease_seconds minimal 30/)
  })
})

describe("claim_post_items — jatuh tempo", () => {
  it("drip: dilewati sampai 10 menit sebelum jadwal tayang", async () => {
    const t = await createTenant("drip", 10)
    const batchId = await createBatch(t, "scheduled_drip")
    const future = await addItem(t, { batchId, scheduledFor: "now() + interval '1 hour'" })
    const soon = await addItem(t, { batchId, scheduledFor: "now() + interval '5 minutes'" })
    const past = await addItem(t, { batchId, scheduledFor: "now() - interval '1 hour'" })

    expect(ids(await claim(10))).toEqual([soon, past].sort())
    const state = await db.query<{ state: string }>("select state from public.post_items where id = $1", [future])
    expect(state.rows[0].state).toBe("queued_input")
  })

  it("item tanpa batch dengan jadwal masa depan diperlakukan bertahap (kecuali payload immediate)", async () => {
    const t = await createTenant("tanpa-batch", 10)
    await addItem(t, { scheduledFor: "now() + interval '2 hours'" })
    const immediate = await db.query<{ id: string }>(
      `insert into public.post_items (user_id, wp_site_id, target_keyword, scheduled_for, source_payload)
       values ($1, $2, 'kw', now() + interval '2 hours', '{"execution_mode": "immediate"}') returning id`,
      [t.userId, t.siteId]
    )

    expect(ids(await claim(10))).toEqual([immediate.rows[0].id])
  })

  it("batch immediate: diklaim sekarang walau jadwal tayang di masa depan (dikirim sebagai future)", async () => {
    const t = await createTenant("immediate", 10)
    const batchId = await createBatch(t, "immediate")
    const item = await addItem(t, { batchId, scheduledFor: "now() + interval '2 days'" })

    expect(ids(await claim(10))).toEqual([item])
  })

  it("backoff: next_attempt_at di masa depan dilewati, yang sudah lewat diklaim", async () => {
    const t = await createTenant("backoff", 10)
    const waiting = await addItem(t, { nextAttemptAt: "now() + interval '5 minutes'" })
    const due = await addItem(t, { nextAttemptAt: "now() - interval '1 second'" })
    const readyWaiting = await addItem(t, { state: "ready_to_sync", nextAttemptAt: "now() + interval '1 minute'" })

    expect(ids(await claim(10))).toEqual([due])
    const states = await db.query<{ id: string; state: string }>(
      "select id, state from public.post_items where id = any($1::uuid[])",
      [[waiting, readyWaiting]]
    )
    expect(states.rows.map((row) => row.state).sort()).toEqual(["queued_input", "ready_to_sync"])
  })

  it("next_attempt_at menggantikan jadwal drip (\"Jalankan sekarang\")", async () => {
    const t = await createTenant("run-now", 10)
    const batchId = await createBatch(t, "scheduled_drip")
    const item = await addItem(t, {
      batchId,
      scheduledFor: "now() + interval '3 days'",
      nextAttemptAt: "now()",
    })

    expect(ids(await claim(10))).toEqual([item])
  })

  it("urutan: jatuh tempo terlama lebih dulu", async () => {
    const t = await createTenant("urutan", 10)
    const newest = await addItem(t, { createdAt: "now() - interval '1 minute'" })
    const oldest = await addItem(t, { createdAt: "now() - interval '30 minutes'" })
    const middle = await addItem(t, { createdAt: "now() - interval '10 minutes'" })

    expect((await claim(1))[0].id).toBe(oldest)
    expect((await claim(1))[0].id).toBe(middle)
    expect((await claim(1))[0].id).toBe(newest)
  })
})

describe("claim_post_items — konkurensi per situs", () => {
  it("menghormati max_concurrency situs termasuk item in-flight dengan lease aktif", async () => {
    const t = await createTenant("konkurensi", 2)
    await addItem(t, { state: "generating_content", lockedUntil: "now() + interval '10 minutes'" })
    for (let i = 0; i < 3; i++) await addItem(t, { createdAt: `now() - interval '${5 - i} minutes'` })
    const otherSite = await addSite(t, 2)
    const other = await addItem(t, { siteId: otherSite })

    const rows = await claim(10)

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.id)).toContain(other)
    // Situs pertama sudah penuh (1 lama + 1 baru = 2); klaim berikutnya kosong.
    expect(await claim(10)).toEqual([])
  })

  it("item in-flight dengan lease kedaluwarsa tidak dihitung terpakai", async () => {
    const t = await createTenant("kedaluwarsa", 2)
    await addItem(t, { state: "generating_content", lockedUntil: "now() - interval '1 minute'" })
    await addItem(t, { state: "syncing_to_wp", lockedUntil: "now() - interval '1 second'", content: true })
    for (let i = 0; i < 3; i++) await addItem(t)

    expect(await claim(10)).toHaveLength(2)
  })

  it("item in-flight lama tanpa lease (worker versi sebelumnya) tetap dihitung terpakai", async () => {
    const t = await createTenant("tanpa-lease", 2)
    await db.query(
      `insert into public.post_items (user_id, wp_site_id, target_keyword, state)
       values ($1, $2, 'lama', 'generating_content')`,
      [t.userId, t.siteId]
    )
    for (let i = 0; i < 3; i++) await addItem(t)

    expect(await claim(10)).toHaveLength(1)
  })

  it("max_concurrency 1 hanya mengizinkan satu item per situs", async () => {
    const t = await createTenant("satu", 1)
    await addItem(t)
    await addItem(t, { state: "ready_to_sync", nextAttemptAt: "now()" })

    expect(await claim(10)).toHaveLength(1)
    expect(await claim(10)).toEqual([])
  })
})

describe("claim_post_items — tenant", () => {
  it("p_user_id membatasi klaim ke item milik pengguna tersebut", async () => {
    const a = await createTenant("filter-a", 10)
    const b = await createTenant("filter-b", 10)
    const itemA = await addItem(a)
    const itemB = await addItem(b)

    expect(ids(await claim(10, a.userId))).toEqual([itemA])
    expect(ids(await claim(10))).toEqual([itemB])
  })

  it("adil antar tenant: giliran per pengguna sebelum item lain dari tenant yang sama", async () => {
    const a = await createTenant("adil-a", 10)
    const b = await createTenant("adil-b", 10)
    const a1 = await addItem(a, { createdAt: "now() - interval '3 hours'" })
    await addItem(a, { createdAt: "now() - interval '2 hours'" })
    await addItem(a, { createdAt: "now() - interval '90 minutes'" })
    const b1 = await addItem(b, { createdAt: "now() - interval '1 minute'" })

    expect(ids(await claim(2))).toEqual([a1, b1].sort())
  })
})

describe("extend_post_item_lease", () => {
  async function extend(id: string, worker: string): Promise<boolean> {
    return asServiceRole(db, async (tx) => {
      const result = await tx.query<{ ok: boolean }>("select public.extend_post_item_lease($1, $2, $3) as ok", [
        id,
        worker,
        LEASE_SECONDS,
      ])
      return result.rows[0].ok
    })
  }

  it("hanya pemegang lease yang dapat memperpanjang item in-flight", async () => {
    const t = await createTenant("extend", 5)
    const item = await addItem(t, {
      state: "generating_content",
      lockedUntil: "now() + interval '1 minute'",
      lockedBy: WORKER,
    })

    expect(await extend(item, "worker-lain")).toBe(false)
    expect(await extend(item, WORKER)).toBe(true)

    const lease = await db.query<{ ok: boolean }>(
      "select locked_until > now() + interval '14 minutes' as ok from public.post_items where id = $1",
      [item]
    )
    expect(lease.rows[0].ok).toBe(true)
  })

  it("item yang sudah dilepas atau tidak in-flight tidak dapat diperpanjang", async () => {
    const t = await createTenant("extend-lepas", 5)
    const released = await addItem(t, { state: "queued_input" })
    const finished = await addItem(t, {
      state: "published_on_wp",
      lockedUntil: "now() + interval '1 minute'",
      lockedBy: WORKER,
    })

    expect(await extend(released, WORKER)).toBe(false)
    expect(await extend(finished, WORKER)).toBe(false)
  })
})

describe("integritas & hak akses", () => {
  it("lease wajib berpasangan (locked_until ⇔ locked_by)", async () => {
    const t = await createTenant("pasangan", 5)
    await expect(
      db.query(
        `insert into public.post_items (user_id, wp_site_id, target_keyword, state, locked_until)
         values ($1, $2, 'kw', 'generating_content', now())`,
        [t.userId, t.siteId]
      )
    ).rejects.toThrow(CHECK_VIOLATION)
    await expect(
      db.query(
        `insert into public.post_items (user_id, wp_site_id, target_keyword, state, locked_by)
         values ($1, $2, 'kw', 'generating_content', 'w')`,
        [t.userId, t.siteId]
      )
    ).rejects.toThrow(CHECK_VIOLATION)
  })

  it("RPC antrean hanya dapat dieksekusi service_role", async () => {
    const privileges = await db.query<{ fn: string; anon: boolean; authenticated: boolean; service: boolean }>(
      `select fn,
              has_function_privilege('anon', fn, 'execute') as anon,
              has_function_privilege('authenticated', fn, 'execute') as authenticated,
              has_function_privilege('service_role', fn, 'execute') as service
       from unnest(array[
         'public.claim_post_items(text, integer, integer, uuid)',
         'public.extend_post_item_lease(uuid, text, integer)'
       ]) as fn`
    )
    for (const row of privileges.rows) {
      expect(row, row.fn).toMatchObject({ anon: false, authenticated: false, service: true })
    }

    const t = await createTenant("rpc-sesi", 5)
    await addItem(t)
    await expect(
      asUser(db, t.userId, (tx) => tx.query("select * from public.claim_post_items('w', 1, 900, $1)", [t.userId]))
    ).rejects.toThrow(PERMISSION_DENIED)
    await expect(asAnon(db, (tx) => tx.query("select * from public.claim_post_items('w', 1, 900)"))).rejects.toThrow(
      PERMISSION_DENIED
    )
  })

  it("sesi pengguna tidak dapat mengantrekan item dengan lease/backoff terisi", async () => {
    const t = await createTenant("sesi-insert", 5)
    const insert = (columns: string, values: string) =>
      asUser(db, t.userId, (tx) =>
        tx.query(
          `insert into public.post_items (user_id, wp_site_id, target_keyword${columns}) values ($1, $2, 'kw'${values})`,
          [t.userId, t.siteId]
        )
      )

    await expect(insert(", next_attempt_at", ", now() - interval '1 day'")).rejects.toThrow(RLS_VIOLATION)
    await expect(insert(", locked_until, locked_by", ", now(), 'palsu'")).rejects.toThrow(RLS_VIOLATION)
    await expect(insert("", "")).resolves.toBeDefined()
  })

  it("sesi pengguna tetap tidak dapat mengubah kolom lease/antrean", async () => {
    const t = await createTenant("sesi-update", 5)
    const item = await addItem(t)
    await expect(
      asUser(db, t.userId, (tx) =>
        tx.query("update public.post_items set next_attempt_at = now() where id = $1", [item])
      )
    ).rejects.toThrow(PERMISSION_DENIED)
  })
})
