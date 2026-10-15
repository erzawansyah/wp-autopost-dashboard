/**
 * Realtime antrean (migrasi `*_realtime_publication.sql` lalu `*_realtime_broadcast.sql`):
 * - post_items & execution_logs akhirnya TIDAK ada di publication `supabase_realtime` (Postgres Changes mati);
 * - tanpa skema Realtime Supabase (prelude PGlite / Postgres polos) trigger, fungsi, dan policy dilewati;
 * - dengan skema Realtime (simulasi minimal `realtime.messages`, `realtime.topic()`, `realtime.send()`):
 *   trigger mengirim payload ringkas ke topik privat pemilik, heartbeat tidak dibroadcast, dan policy
 *   `realtime.messages` hanya mengizinkan join topik `user:<auth.uid()>:…`.
 */
import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  asAnon,
  asUser,
  createTestDb,
  readMigration,
  runSqlFile,
  seedTenant,
  type TenantFixture,
} from "./helpers/test-db"

const PUBLICATION_MIGRATION = readMigration("_realtime_publication.sql")
const BROADCAST_MIGRATION = readMigration("_realtime_broadcast.sql")
const TRIGGERS = [
  "broadcast_post_item_update",
  "broadcast_post_items_inserted",
  "broadcast_post_items_deleted",
  "broadcast_execution_log",
]
const FUNCTIONS = TRIGGERS

/** Skema Realtime minimal seperti di Supabase (bentuk kolom & fungsi yang dipakai migrasi). */
const REALTIME_SCHEMA_STUB = `
  create schema if not exists realtime;
  create table if not exists realtime.messages (
    id bigserial primary key,
    topic text not null,
    extension text not null,
    payload jsonb,
    event text,
    private boolean default false,
    inserted_at timestamptz not null default now()
  );
  alter table realtime.messages enable row level security;
  grant usage on schema realtime to anon, authenticated;
  grant select on realtime.messages to anon, authenticated;
  create or replace function realtime.topic() returns text
    language sql stable
    as $$ select nullif(current_setting('realtime.topic', true), '')::text $$;
  create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
    returns void
    language plpgsql
    as $$
    begin
      perform set_config('realtime.topic', topic, true);
      insert into realtime.messages (payload, event, topic, private, extension)
      values (payload, event, topic, private, 'broadcast');
    end;
    $$;
`

interface MessageRow {
  topic: string
  event: string
  private: boolean
  payload: Record<string, unknown>
}

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

async function installedTriggers(): Promise<string[]> {
  const result = await db.query<{ tgname: string }>(
    `select tgname from pg_trigger where not tgisinternal and tgname like 'broadcast_%' order by tgname`
  )
  return result.rows.map((row) => row.tgname)
}

describe("publication supabase_realtime", () => {
  it("tanpa publication: kedua migrasi lolos tanpa membuat publication", async () => {
    await runSqlFile(db, PUBLICATION_MIGRATION)
    await runSqlFile(db, BROADCAST_MIGRATION)
    const result = await db.query("select 1 from pg_publication where pubname = 'supabase_realtime'")
    expect(result.rows).toHaveLength(0)
  })

  it("migrasi Broadcast mengeluarkan tabel antrean (idempoten); tabel lain tidak disentuh", async () => {
    await db.exec("create publication supabase_realtime for table public.content_batches")
    try {
      await runSqlFile(db, PUBLICATION_MIGRATION)
      expect(await publishedTables()).toEqual(["content_batches", "execution_logs", "post_items"])

      await runSqlFile(db, BROADCAST_MIGRATION)
      await runSqlFile(db, BROADCAST_MIGRATION)
      expect(await publishedTables()).toEqual(["content_batches"])
    } finally {
      await db.exec("drop publication if exists supabase_realtime")
    }
  })

  it("publication FOR ALL TABLES: tidak mencoba ALTER (tidak error)", async () => {
    await db.exec("create publication supabase_realtime for all tables")
    try {
      await expect(runSqlFile(db, BROADCAST_MIGRATION)).resolves.toBeUndefined()
    } finally {
      await db.exec("drop publication if exists supabase_realtime")
    }
  })
})

describe("tanpa skema Realtime Supabase", () => {
  it("trigger, fungsi, dan policy Broadcast tidak dibuat; tulis antrean tetap berjalan", async () => {
    expect(await installedTriggers()).toEqual([])
    const functions = await db.query("select proname from pg_proc where proname like 'broadcast_%'")
    expect(functions.rows).toHaveLength(0)
    const tenant = await seedTenant(db, "rt-tanpa")
    await db.query("update public.post_items set state = 'failed_sync' where id = $1", [tenant.postId])
  })
})

describe("dengan skema Realtime (simulasi)", () => {
  let a: TenantFixture
  let b: TenantFixture

  beforeAll(async () => {
    await db.exec(REALTIME_SCHEMA_STUB)
    await runSqlFile(db, BROADCAST_MIGRATION)
    await runSqlFile(db, BROADCAST_MIGRATION)
    a = await seedTenant(db, "rt-a")
    b = await seedTenant(db, "rt-b")
  })

  beforeEach(async () => {
    await db.exec("delete from realtime.messages")
  })

  async function messages(): Promise<MessageRow[]> {
    const result = await db.query<MessageRow>("select topic, event, private, payload from realtime.messages order by id")
    return result.rows
  }

  it("trigger & fungsi terpasang (idempoten); EXECUTE dicabut dari role API", async () => {
    expect(await installedTriggers()).toEqual([...TRIGGERS].sort())
    for (const fn of FUNCTIONS) {
      for (const role of ["anon", "authenticated"]) {
        const result = await db.query<{ allowed: boolean }>(
          `select has_function_privilege($1, $2, 'EXECUTE') as allowed`,
          [role, `public.${fn}()`]
        )
        expect(result.rows[0].allowed).toBe(false)
      }
      const definition = await db.query<{ secdef: boolean; config: string[] | null }>(
        "select prosecdef as secdef, proconfig as config from pg_proc where proname = $1",
        [fn]
      )
      expect(definition.rows[0]).toEqual({ secdef: true, config: ['search_path=""'] })
    }
  })

  it("UPDATE kolom status → satu pesan privat ringkas ke topik antrean pemilik", async () => {
    await db.query("update public.post_items set state = 'failed_sync', last_error = 'HTTP 500' where id = $1", [a.postId])

    const [message, ...rest] = await messages()
    expect(rest).toEqual([])
    expect(message).toMatchObject({ topic: `user:${a.userId}:queue`, event: "post_item", private: true })
    expect(message.payload.op).toBe("UPDATE")
    const record = message.payload.record as Record<string, unknown>
    expect(Object.keys(record).sort()).toEqual(
      [
        "batch_id",
        "id",
        "last_error",
        "next_attempt_at",
        "retry_count",
        "scheduled_for",
        "state",
        "title",
        "updated_at",
        "wp_post_id",
        "wp_post_url",
        "wp_target_status",
      ].sort()
    )
    expect(record).toMatchObject({ id: a.postId, state: "failed_sync", last_error: "HTTP 500" })
  })

  it("heartbeat (hanya updated_at) tidak dibroadcast", async () => {
    await db.query("update public.post_items set updated_at = now() where id = $1", [a.postId])
    expect(await messages()).toEqual([])
  })

  it("INSERT banyak item → satu pesan per pemilik per statement", async () => {
    await db.query(
      `insert into public.post_items (user_id, wp_site_id, target_keyword)
       select $1, $2, 'kw ' || i from generate_series(1, 3) as i`,
      [b.userId, b.siteId]
    )
    expect(await messages()).toEqual([
      { topic: `user:${b.userId}:queue`, event: "post_items_inserted", private: true, payload: { op: "INSERT", count: 3 } },
    ])
  })

  it("DELETE → daftar ID terhapus ke topik pemilik", async () => {
    const inserted = await db.query<{ id: string }>(
      "insert into public.post_items (user_id, wp_site_id, target_keyword) values ($1, $2, 'hapus') returning id",
      [b.userId, b.siteId]
    )
    await db.exec("delete from realtime.messages")
    await db.query("delete from public.post_items where id = $1", [inserted.rows[0].id])
    expect(await messages()).toEqual([
      {
        topic: `user:${b.userId}:queue`,
        event: "post_items_deleted",
        private: true,
        payload: { op: "DELETE", count: 1, ids: [inserted.rows[0].id] },
      },
    ])
  })

  it("log eksekusi → topik detail artikel; details besar tidak ikut dikirim", async () => {
    await db.query(
      `insert into public.execution_logs (post_item_id, user_id, step, message, details)
       values ($1, $2, 'model_call', 'kecil', '{"durationMs": 5}')`,
      [a.postId, a.userId]
    )
    await db.query(
      `insert into public.execution_logs (post_item_id, user_id, step, message, details)
       values ($1, $2, 'tool_call', 'besar', (select jsonb_build_object('blob', jsonb_agg(md5(i::text))) from generate_series(1, 2000) as i))`,
      [a.postId, a.userId]
    )

    const [small, large] = await messages()
    expect(small).toMatchObject({ topic: `user:${a.userId}:post:${a.postId}`, event: "execution_log", private: true })
    expect(small.payload).toMatchObject({
      post_item_id: a.postId,
      details_truncated: false,
      log: { step: "model_call", message: "kecil", details: { durationMs: 5 } },
    })
    expect(large.payload).toMatchObject({ details_truncated: true, log: { step: "tool_call", details: null } })
  })

  it("policy: authenticated hanya boleh join topik berawalan user:<auth.uid()>:", async () => {
    await db.query("insert into realtime.messages (topic, extension, event, payload) values ('dummy', 'broadcast', 'x', '{}')")

    async function visibleAs(userId: string, topic: string): Promise<number> {
      return asUser(db, userId, async (tx) => {
        await tx.query("select set_config('realtime.topic', $1, true)", [topic])
        const result = await tx.query<{ n: number }>("select count(*)::int as n from realtime.messages")
        return result.rows[0].n
      })
    }

    expect(await visibleAs(a.userId, `user:${a.userId}:queue`)).toBeGreaterThan(0)
    expect(await visibleAs(a.userId, `user:${a.userId}:post:${a.postId}`)).toBeGreaterThan(0)
    expect(await visibleAs(a.userId, `user:${b.userId}:queue`)).toBe(0)
    expect(await visibleAs(a.userId, `user:${a.userId}`)).toBe(0)
    expect(await visibleAs(a.userId, "room-1")).toBe(0)

    const anonVisible = await asAnon(db, async (tx) => {
      await tx.query("select set_config('realtime.topic', $1, true)", [`user:${a.userId}:queue`])
      const result = await tx.query<{ n: number }>("select count(*)::int as n from realtime.messages")
      return result.rows[0].n
    })
    expect(anonVisible).toBe(0)
  })

  it("policy hanya untuk pesan Broadcast (bukan Presence)", async () => {
    await db.query(
      "insert into realtime.messages (topic, extension, event, payload) values ($1, 'presence', 'x', '{}')",
      [`user:${a.userId}:queue`]
    )
    const visible = await asUser(db, a.userId, async (tx) => {
      await tx.query("select set_config('realtime.topic', $1, true)", [`user:${a.userId}:queue`])
      const result = await tx.query<{ extension: string }>("select extension from realtime.messages")
      return result.rows.map((row) => row.extension)
    })
    expect(visible).not.toContain("presence")
  })
})
