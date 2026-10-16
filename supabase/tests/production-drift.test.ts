/**
 * Upgrade dari bentuk skema production lama yang terlihat di pre-flight & inventaris production (16 Okt 2026), di
 * atas fixture legacy: `webhooks.events` bertipe text[] (+ indeks GIN, menguji pembersihan indeks), `user_settings`
 * tanpa kolom `id` (PRIMARY KEY `user_id`), trigger `trg_*_updated_at` yang mengeksekusi `handle_updated_at()`,
 * `agent_profiles.skills` nullable, dan default `content_batches` lama ('completed', 1). Pre-flight tidak boleh
 * GAGAL sebelum maupun sesudah migrasi; migrasi mengonversi tanpa kehilangan data dan menyamakan skema dengan
 * instalasi baru.
 */
import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { check, runPreflight, withStatus, type PreflightRow } from "./helpers/preflight"
import { applyMigrationsAndSeed, createBareDb, createUser, readSupabaseFile } from "./helpers/test-db"

const LEGACY_TRIGGER_TABLES = ["content_batches", "post_items", "user_settings", "webhooks", "wp_sites"] as const

let db: PGlite
let userId: string
let webhookId: string
let siteId: string
let before: PreflightRow[]
let after: PreflightRow[]

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<T>(sql, params)
  const row = result.rows[0]
  if (row === undefined) throw new Error(`Query tidak mengembalikan baris: ${sql}`)
  return row
}

beforeAll(async () => {
  db = await createBareDb()
  await db.exec(readSupabaseFile("tests/fixtures/legacy-adhoc-schema.sql"))
  // Bentuk production lama yang tidak tercakup fixture tebakan.
  await db.exec(`
    alter table public.webhooks alter column events drop default;
    -- Tabel masih kosong saat bentuk lama dibuat (data disisipkan setelahnya sebagai text[]).
    alter table public.webhooks alter column events type text[] using '{}'::text[];
    alter table public.webhooks alter column events set default '{}'::text[];
    create index webhooks_events_gin_idx on public.webhooks using gin (events);

    alter table public.user_settings drop column id;
    alter table public.user_settings add primary key (user_id);

    create function public.handle_updated_at() returns trigger language plpgsql as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;
    ${LEGACY_TRIGGER_TABLES.map(
      (table) =>
        `create trigger trg_${table}_updated_at before update on public.${table}
           for each row execute function public.handle_updated_at();`
    ).join("\n")}

    -- Production punya kolom ini nullable (baseline hanya menambah bila belum ada).
    alter table public.agent_profiles add column skills text[] default '{}'::text[];
    alter table public.content_batches alter column status set default 'completed';
    alter table public.content_batches alter column total_items set default 1;
  `)

  userId = await createUser(db, "drift")
  const webhook = await one<{ id: string }>(
    `insert into public.webhooks (user_id, name, url, encrypted_secret, events)
     values ($1, 'Hook lama', 'https://hooks.example.test/in', 'iv:tag:cipher', array['post.published', 'batch.completed'])
     returning id`,
    [userId]
  )
  webhookId = webhook.id
  await db.query(
    `insert into public.webhooks (user_id, name, url, encrypted_secret, events)
     values ($1, 'Hook tanpa event', 'https://hooks.example.test/kosong', 'iv:tag:cipher', null)`,
    [userId]
  )
  await db.query("insert into public.user_settings (user_id, encrypted_openrouter_key) values ($1, 'iv:tag:cipher')", [
    userId,
  ])
  // Kolom nullable berisi NULL → diisi default saat NOT NULL ditegakkan migrasi konvergensi.
  const site = await one<{ id: string }>(
    `insert into public.wp_sites (user_id, site_name, base_url, wp_username, encrypted_app_password, max_concurrency)
     values ($1, 'Situs lama', 'https://lama.example.test', 'editor', 'iv:tag:cipher', null) returning id`,
    [userId]
  )
  siteId = site.id

  before = await runPreflight(db)
  await applyMigrationsAndSeed(db)
  after = await runPreflight(db)
}, 120_000)

afterAll(async () => {
  await db.close()
})

describe("pre-flight pada bentuk production lama", () => {
  it("trigger handle_updated_at & nullability dilaporkan INFO (ditangani migrasi konvergensi)", () => {
    expect(check(before, "Trigger updated_at lama")).toMatchObject({ status: "INFO", jumlah: LEGACY_TRIGGER_TABLES.length })
    expect(check(before, "Trigger yang tidak dikenal migrasi").status).toBe("OK")
    expect(check(before, "Nullability: kolom NOT NULL di migrasi")).toMatchObject({ status: "INFO" })
    expect(check(before, "Nullability: kolom NOT NULL di migrasi").tindakan).toContain("wp_sites.max_concurrency (1 NULL)")
  })

  it("tanpa GAGAL: events text[] dilaporkan INFO (dikonversi baseline), CHECK events dapat diperiksa", () => {
    expect(withStatus(before, "GAGAL")).toEqual([])
    expect(check(before, "Drift tipe webhooks.events")).toMatchObject({ status: "INFO" })
    expect(check(before, "Drift tipe webhooks.events").tindakan).toContain("Dikonversi otomatis")
    expect(check(before, "CHECK webhooks_events_check")).toMatchObject({ status: "OK", jumlah: 0 })
    expect(check(before, "Kolom yang belum ada di tabel yang sudah ada").tindakan).toContain("user_settings.id")
  })

  it("setelah migrasi: tanpa GAGAL, tanpa drift tipe, nullability & trigger lama beres; user_settings.id sudah ada", () => {
    expect(withStatus(after, "GAGAL")).toEqual([])
    // PGlite uji tidak punya skema Realtime Supabase (di production baris ini OK).
    expect(withStatus(after, "PERINGATAN").filter((row) => !row.startsWith("Skema Realtime Supabase"))).toEqual([])
    expect(check(after, "Drift tipe kolom")).toMatchObject({ status: "OK" })
    expect(check(after, "Nullability: kolom NOT NULL di migrasi").status).toBe("OK")
    expect(check(after, "Trigger updated_at lama").status).toBe("OK")
    expect(check(after, "Kolom yang belum ada di tabel yang sudah ada").tindakan).not.toContain("user_settings.id")
  })
})

describe("migrasi di atas bentuk production lama", () => {
  it("webhooks.events menjadi jsonb NOT NULL default '[]' tanpa kehilangan isi; NULL → []", async () => {
    const column = await one<{ type: string; nullable: string; default: string }>(
      `select format_type(atttypid, atttypmod) as type,
              case when attnotnull then 'NO' else 'YES' end as nullable,
              pg_get_expr(d.adbin, d.adrelid) as default
       from pg_attribute as a
       left join pg_attrdef as d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where a.attrelid = 'public.webhooks'::regclass and a.attname = 'events'`
    )
    expect(column).toEqual({ type: "jsonb", nullable: "NO", default: "'[]'::jsonb" })

    const rows = await db.query<{ id: string; events: unknown }>("select id, events from public.webhooks order by name")
    expect(rows.rows.find((row) => row.id === webhookId)?.events).toEqual(["post.published", "batch.completed"])
    expect(rows.rows.map((row) => row.events)).toContainEqual([])
  })

  it("indeks GIN lama pada events dibuang (operator class array tidak berlaku untuk jsonb)", async () => {
    const result = await db.query("select 1 from pg_indexes where schemaname = 'public' and indexname = 'webhooks_events_gin_idx'")
    expect(result.rows).toEqual([])
  })

  it("user_settings.id terisi uuid unik untuk baris lama; user_id tetap unik", async () => {
    const row = await one<{ id: string | null }>("select id from public.user_settings where user_id = $1", [userId])
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/)
    const unique = await db.query<{ conname: string }>(
      `select conname from pg_constraint
       where conrelid = 'public.user_settings'::regclass and contype in ('p', 'u') order by conname`
    )
    expect(unique.rows.map((r) => r.conname)).toEqual(expect.arrayContaining(["user_settings_id_key"]))
  })

  it("trigger handle_updated_at lama dihapus; fungsinya dibiarkan untuk rollback R1", async () => {
    const legacyTriggers = await db.query(
      `select 1 from pg_trigger where not tgisinternal and tgfoid = 'public.handle_updated_at()'::regprocedure`
    )
    expect(legacyTriggers.rows).toEqual([])
    const fn = await db.query("select to_regprocedure('public.handle_updated_at()') is not null as ada")
    expect(fn.rows).toEqual([{ ada: true }])
    await db.query("update public.webhooks set name = 'Hook baru' where id = $1", [webhookId])
    const triggers = await db.query<{ tgname: string }>(
      `select tgname from pg_trigger where tgrelid = 'public.webhooks'::regclass and not tgisinternal order by tgname`
    )
    expect(triggers.rows.map((r) => r.tgname)).toEqual(["set_updated_at"])
  })

  it("kolom nullable lama: NULL diisi default lalu NOT NULL; default batch disamakan dengan instalasi baru", async () => {
    const row = await one<{ max_concurrency: number }>("select max_concurrency from public.wp_sites where id = $1", [siteId])
    expect(row.max_concurrency).toBe(2)
    const columns = await db.query<{ item: string }>(
      `select c.relname || '.' || a.attname || ' notnull=' || a.attnotnull || ' default=' || pg_get_expr(d.adbin, d.adrelid) as item
       from pg_attribute as a
       join pg_class as c on c.oid = a.attrelid
       left join pg_attrdef as d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where c.relnamespace = 'public'::regnamespace
         and (c.relname, a.attname) in (('agent_profiles', 'skills'), ('content_batches', 'status'),
                                        ('content_batches', 'total_items'), ('wp_sites', 'max_concurrency'))
       order by 1`
    )
    expect(columns.rows.map((r) => r.item)).toEqual([
      "agent_profiles.skills notnull=true default='{}'::text[]",
      "content_batches.status notnull=true default='draft'::text",
      "content_batches.total_items notnull=true default=0",
      "wp_sites.max_concurrency notnull=true default=2",
    ])
  })
})
