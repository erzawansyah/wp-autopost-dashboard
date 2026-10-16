/**
 * Pre-flight upgrade production `main` → `v2` (`supabase/preflight/upgrade-v2.sql`, runbook
 * `docs/deploy/upgrade-ke-v2.md`):
 * (i)   skema ad-hoc lama (fixture legacy) + data bersih → skrip berjalan tanpa error, tanpa GAGAL; objek yang
 *       belum ada dilaporkan INFO; skrip tidak mengubah katalog maupun data dan aman dijalankan ulang;
 * (ii)  data bermasalah (duplikat, lintas tenant, state tak dikenal, pelanggar CHECK, tipe kolom berbeda, objek
 *       katalog asing) terdeteksi GAGAL/PERINGATAN;
 * (iii) setelah seluruh migrasi (instalasi baru & upgrade dari skema lama) tidak ada GAGAL maupun drift tipe, dan
 *       daftar ekspektasi di skrip (kolom, CHECK, versi migrasi) identik dengan katalog hasil migrasi — bila
 *       migrasi berubah tanpa memperbarui skrip, test ini gagal.
 */
import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  applyMigrationsAndSeed,
  catalogSnapshot,
  createBareDb,
  createTestDb,
  createUser,
  readMigrations,
  readSupabaseFile,
} from "./helpers/test-db"

const PREFLIGHT_SQL = readSupabaseFile("preflight/upgrade-v2.sql")
const STATUSES = ["OK", "GAGAL", "PERINGATAN", "INFO"] as const

type PreflightStatus = (typeof STATUSES)[number]

interface PreflightRow {
  pemeriksaan: string
  status: PreflightStatus
  jumlah: number | null
  tindakan: string
}

/** Jalankan seluruh berkas pre-flight (seperti SQL Editor) dan kembalikan result set query terakhir. */
async function runPreflight(db: PGlite): Promise<PreflightRow[]> {
  const results = await db.exec(PREFLIGHT_SQL)
  const last = results.at(-1)
  if (!last) throw new Error("Pre-flight tidak mengembalikan result set.")
  return last.rows.map((row) => {
    const { pemeriksaan, status, jumlah, tindakan } = row as Record<string, unknown>
    if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) {
      throw new Error(`Status pre-flight tidak dikenal: ${String(status)}`)
    }
    return {
      pemeriksaan: String(pemeriksaan),
      status: status as PreflightStatus,
      jumlah: jumlah === null || jumlah === undefined ? null : Number(jumlah),
      tindakan: String(tindakan),
    }
  })
}

/** Satu baris berdasarkan awalan nama pemeriksaan (harus tepat satu). */
function check(rows: PreflightRow[], prefix: string): PreflightRow {
  const found = rows.filter((row) => row.pemeriksaan.startsWith(prefix))
  if (found.length !== 1) {
    throw new Error(`Diharapkan tepat 1 baris berawalan "${prefix}", ditemukan ${found.length}.`)
  }
  return found[0] as PreflightRow
}

function withStatus(rows: PreflightRow[], status: PreflightStatus): string[] {
  return rows.filter((row) => row.status === status).map((row) => `${row.pemeriksaan}: ${row.tindakan}`)
}

async function one<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<T>(sql, params)
  const row = result.rows[0]
  if (row === undefined) throw new Error(`Query tidak mengembalikan baris: ${sql}`)
  return row
}

interface LegacyData {
  userA: string
  userB: string
  siteA: string
  siteB: string
}

/**
 * Data "production" bersih di skema lama: dua tenant, batch, item di beberapa state (tanpa in-flight), log,
 * Agent Profile, run, pengaturan, webhook, cache media tanpa pemilik, dan failed_sync tanpa naskah.
 */
async function seedLegacyData(db: PGlite): Promise<LegacyData> {
  const userA = await createUser(db, "lama-a")
  const userB = await createUser(db, "lama-b")
  const insertSite = async (userId: string, host: string) =>
    (
      await one<{ id: string }>(
        db,
        `insert into public.wp_sites (user_id, site_name, base_url, wp_username, encrypted_app_password)
         values ($1, $2, $3, 'editor', 'iv:tag:cipher') returning id`,
        [userId, host, `https://${host}`]
      )
    ).id
  const siteA = await insertSite(userA, "a.example.test")
  const siteB = await insertSite(userB, "b.example.test")

  const { id: batchA } = await one<{ id: string }>(
    db,
    `insert into public.content_batches (user_id, wp_site_id, name, execution_mode, status, total_items, ai_config)
     values ($1, $2, 'Batch lama', 'scheduled_drip', 'running', 2, '{"category_names": ["Umum"]}') returning id`,
    [userA, siteA]
  )
  const { id: queuedA } = await one<{ id: string }>(
    db,
    // Kategori per baris Tulis Terstruktur (aplikasi lama hanya menyimpannya sebagai label) → di-backfill migrasi.
    `insert into public.post_items (user_id, wp_site_id, batch_id, target_keyword, state, scheduled_for, categories)
     values ($1, $2, $3, 'antre', 'queued_input', now() + interval '1 day', '["Resep"]') returning id`,
    [userA, siteA, batchA]
  )
  await db.query(
    `insert into public.post_items (user_id, wp_site_id, batch_id, target_keyword, state, title, content_html, wp_post_id)
     values ($1, $2, $3, 'terbit', 'published_on_wp', 'Judul', '<p>isi</p>', 101)`,
    [userA, siteA, batchA]
  )
  await db.query(
    `insert into public.post_items (user_id, wp_site_id, target_keyword, state, last_error)
     values ($1, $2, 'tanpa naskah', 'failed_sync', 'timeout')`,
    [userA, siteA]
  )
  await db.query(
    `insert into public.post_items (user_id, wp_site_id, target_keyword, state, title, content_html, wp_post_id)
     values ($1, $2, 'draf', 'saved_draft_on_wp', 'Draf', '<p>isi</p>', 7)`,
    [userB, siteB]
  )
  await db.query(
    "insert into public.execution_logs (post_item_id, user_id, step, message) values ($1, $2, 'queue', 'masuk antrean')",
    [queuedA, userA]
  )
  await db.query(
    `insert into public.agent_profiles (user_id, name, mode, workflow_prompt, limits)
     values ($1, 'Profil lama', 'deep', 'Tulis.', '{"perTool": {"web_search": 3}}')`,
    [userA]
  )
  await db.query(
    "insert into public.agent_runs (post_item_id, user_id, profile_ref, status) values ($1, $2, 'preset:quick-writer', 'completed')",
    [queuedA, userA]
  )
  await db.query("insert into public.user_settings (user_id, encrypted_openrouter_key) values ($1, 'iv:tag:cipher')", [
    userA,
  ])
  await db.query(
    `insert into public.webhooks (user_id, name, url, encrypted_secret, events)
     values ($1, 'Hook', 'https://hooks.example.test/in', 'iv:tag:cipher', '["post.published"]')`,
    [userA]
  )
  // Cache media tanpa pemilik (skema lama: user_id nullable) → diisi baseline dari pemilik situs.
  await db.query(
    `insert into public.uploaded_media (site_id, source_url, site_url, image_id)
     values ($1, 'https://img.example.test/a.jpg', 'https://a.example.test/a.jpg', 10)`,
    [siteA]
  )
  return { userA, userB, siteA, siteB }
}

async function createLegacyDb(): Promise<{ db: PGlite; data: LegacyData }> {
  const db = await createBareDb()
  await db.exec(readSupabaseFile("tests/fixtures/legacy-adhoc-schema.sql"))
  return { db, data: await seedLegacyData(db) }
}

/** Ringkasan data aplikasi untuk membuktikan pre-flight tidak menulis apa pun. */
async function dataFingerprint(db: PGlite): Promise<unknown[]> {
  const result = await db.query(
    `select (select count(*) from public.wp_sites)::int as sites,
            (select count(*) from public.post_items)::int as posts,
            (select string_agg(state || ':' || updated_at::text, ',' order by id) from public.post_items) as states,
            (select count(*) from public.execution_logs)::int as logs,
            (select count(*) from public.uploaded_media where user_id is null)::int as orphan_media`
  )
  return result.rows
}

function expectNoFailures(rows: PreflightRow[]): void {
  expect(withStatus(rows, "GAGAL")).toEqual([])
}

function expectNoTypeDrift(rows: PreflightRow[]): void {
  expect(check(rows, "Drift tipe kolom").status).toBe("OK")
  expect(rows.filter((row) => /^Drift tipe \S+\.\S+$/.test(row.pemeriksaan))).toEqual([])
}

describe("(i) skema lama + data bersih", () => {
  let legacy: { db: PGlite; data: LegacyData }
  let rows: PreflightRow[]

  beforeAll(async () => {
    legacy = await createLegacyDb()
    rows = await runPreflight(legacy.db)
  }, 60_000)

  afterAll(async () => {
    await legacy.db.close()
  })

  it("berjalan tanpa error dan tidak ada GAGAL", () => {
    expect(rows.length).toBeGreaterThan(50)
    expectNoFailures(rows)
    for (const prefix of ["PostgreSQL >= 15", "Role Data API", "auth.users & auth.uid()", "Hak pemilik objek aplikasi"]) {
      expect(check(rows, prefix).status, prefix).toBe("OK")
    }
  })

  it("objek yang belum ada di skema lama dilaporkan INFO, bukan error", () => {
    expect(check(rows, "Tabel aplikasi yang belum ada")).toMatchObject({ status: "INFO", jumlah: 1 })
    expect(check(rows, "Tabel aplikasi yang belum ada").tindakan).toContain("generation_checkpoints")
    expect(check(rows, "Kolom yang belum ada di tabel yang sudah ada").tindakan).toContain("post_items.locked_by")
    expect(check(rows, "CHECK post_items_lease_check").status).toBe("INFO")
    expect(check(rows, "CHECK agent_runs_model_check").status).toBe("INFO")
    expect(check(rows, "Riwayat migrasi").status).toBe("INFO")
    expectNoTypeDrift(rows)
  })

  it("data yang akan diubah migrasi dan dampak BYOK dilaporkan INFO", () => {
    expect(check(rows, "Data fix Fase 0: failed_sync tanpa naskah")).toMatchObject({ status: "INFO", jumlah: 1 })
    expect(check(rows, "uploaded_media.user_id kosong yang akan diisi")).toMatchObject({ status: "INFO", jumlah: 1 })
    expect(check(rows, "Backfill kategori per baris")).toMatchObject({ status: "INFO", jumlah: 1 })
    expect(check(rows, "Tenant bersitus tanpa kunci OpenRouter")).toMatchObject({ status: "INFO", jumlah: 1 })
    expect(check(rows, "Antrean menunggu")).toMatchObject({ status: "INFO", jumlah: 1 })
    expect(check(rows, "Antrean in-flight")).toMatchObject({ status: "OK", jumlah: 0 })
    expect(check(rows, "Kolom ekstra di production").tindakan).toContain("user_settings.encrypted_pexels_key")
  })

  it("read-only & aman dijalankan ulang: katalog public, data, dan hasil tidak berubah", async () => {
    const catalogBefore = await catalogSnapshot(legacy.db, { columns: true })
    const dataBefore = await dataFingerprint(legacy.db)

    const again = await runPreflight(legacy.db)

    expect(again).toEqual(rows)
    expect(await catalogSnapshot(legacy.db, { columns: true })).toEqual(catalogBefore)
    expect(await dataFingerprint(legacy.db)).toEqual(dataBefore)
  })
})

describe("(ii) data bermasalah di skema lama", () => {
  let legacy: { db: PGlite; data: LegacyData }
  let rows: PreflightRow[]

  beforeAll(async () => {
    legacy = await createLegacyDb()
    const { db, data } = legacy
    // Production lama dapat tidak memiliki CHECK yang ada di fixture: hapus dulu agar data invalid bisa masuk.
    await db.exec(`
      alter table public.post_items drop constraint post_items_state_check;
      alter table public.execution_logs drop constraint execution_logs_level_check;
      alter table public.agent_skills drop constraint agent_skills_slug_check;
    `)
    // Duplikat UNIQUE (user_id, base_url).
    await db.query(
      `insert into public.wp_sites (user_id, site_name, base_url, wp_username, encrypted_app_password)
       values ($1, 'Ganda', 'https://a.example.test', 'editor', 'iv:tag:cipher')`,
      [data.userA]
    )
    // Lintas tenant: item milik A merujuk situs milik B.
    await db.query(
      "insert into public.post_items (user_id, wp_site_id, target_keyword) values ($1, $2, 'lintas tenant')",
      [data.userA, data.siteB]
    )
    // State tak dikenal, state NULL, dan item in-flight.
    await db.query(
      `insert into public.post_items (user_id, wp_site_id, target_keyword, state)
       values ($1, $2, 'state lama', 'draft_lama'), ($1, $2, 'state null', null), ($1, $2, 'jalan', 'generating_content')`,
      [data.userA, data.siteA]
    )
    // Pelanggar CHECK baru + nilai yang dinormalkan migrasi.
    await db.query(
      "insert into public.execution_logs (user_id, step, level, message) values ($1, 'generation', 'success', 'ok')",
      [data.userA]
    )
    await db.query(
      "insert into public.agent_skills (user_id, name, slug, content) values ($1, 'Gaya Brand', 'Gaya Brand', '# Gaya')",
      [data.userA]
    )
    await db.query("update public.wp_sites set max_concurrency = 0 where id = $1", [data.siteA])
    await db.query("update public.wp_sites set max_concurrency = 50, status = null where id = $1", [data.siteB])
    await db.query("insert into public.user_settings (user_id) values (null)")
    // Drift tipe: fatal (jsonb → json) dan non-fatal (bigint → integer).
    await db.exec(`
      alter table public.content_batches alter column ai_config drop default;
      alter table public.content_batches alter column ai_config type json using ai_config::json;
      alter table public.post_items alter column wp_post_id type integer;
    `)
    // Objek katalog yang tidak dikenal migrasi.
    await db.exec(`
      alter table public.post_items add constraint post_items_keyword_length_check check (char_length(target_keyword) < 500);
      create function public.legacy_touch() returns trigger language plpgsql as $$ begin return new; end; $$;
      create trigger legacy_touch before update on public.wp_sites for each row execute function public.legacy_touch();
      alter table public.webhooks add column legacy_flag text not null default 'x';
      alter table public.webhooks alter column legacy_flag drop default;
      create table public.prompt_templates (id uuid primary key default gen_random_uuid(), body text);
      create view public.post_states as select id, state from public.post_items;
    `)
    rows = await runPreflight(db)
  }, 60_000)

  afterAll(async () => {
    await legacy.db.close()
  })

  it.each([
    ["UNIQUE wp_sites (user_id, base_url)", 1],
    ["FK post_items (wp_site_id, user_id) → wp_sites", 1],
    ["CHECK post_items_state_check", 1],
    ["CHECK execution_logs_level_check", 1],
    ["CHECK agent_skills_slug_check", 1],
    ["CHECK wp_sites_max_concurrency_check (< 1)", 1],
    ["NOT NULL user_settings.user_id", 1],
    ["Kolom ekstra NOT NULL tanpa default", 1],
  ])("GAGAL: %s", (prefix, jumlah) => {
    expect(check(rows, prefix)).toMatchObject({ status: "GAGAL", jumlah })
  })

  it("drift tipe kolom: jsonb → json GAGAL (CHECK jsonb_typeof tidak dapat diperiksa), bigint → integer PERINGATAN", () => {
    const fatal = check(rows, "Drift tipe content_batches.ai_config")
    expect(fatal.status).toBe("GAGAL")
    expect(fatal.tindakan).toContain("Production: json; migrasi mengharapkan: jsonb")
    expect(check(rows, "CHECK content_batches_ai_config_check").status).toBe("PERINGATAN")
    expect(check(rows, "Drift tipe post_items.wp_post_id")).toMatchObject({ status: "PERINGATAN" })
    expect(check(rows, "Drift tipe post_items.wp_post_id").tindakan).toContain("Production: integer")
  })

  it.each([
    "Antrean in-flight",
    "post_items.state NULL",
    "Nullability: kolom NOT NULL di migrasi",
    "CHECK constraint yang tidak dikenal migrasi",
    "Trigger yang tidak dikenal migrasi",
    "Tabel lain di skema public",
    "View di skema public",
  ])("PERINGATAN: %s", (prefix) => {
    expect(check(rows, prefix).status).toBe("PERINGATAN")
  })

  it("rincian temuan katalog menyebut objeknya", () => {
    expect(check(rows, "Nullability: kolom NOT NULL di migrasi").tindakan).toContain("wp_sites.status (1 NULL)")
    expect(check(rows, "CHECK constraint yang tidak dikenal migrasi").tindakan).toContain(
      "post_items.post_items_keyword_length_check"
    )
    expect(check(rows, "Trigger yang tidak dikenal migrasi").tindakan).toContain("wp_sites.legacy_touch")
    expect(check(rows, "Tabel lain di skema public").tindakan).toContain("prompt_templates (RLS NONAKTIF)")
    expect(check(rows, "View di skema public").tindakan).toContain("post_states")
    expect(check(rows, "Normalisasi wp_sites.max_concurrency > 10")).toMatchObject({ status: "INFO", jumlah: 1 })
  })
})

describe("(iii) setelah seluruh migrasi", () => {
  describe("instalasi baru", () => {
    let db: PGlite
    let rows: PreflightRow[]

    beforeAll(async () => {
      db = await createTestDb()
      rows = await runPreflight(db)
    }, 60_000)

    afterAll(async () => {
      await db.close()
    })

    it("tidak ada GAGAL, tidak ada drift tipe maupun objek katalog asing", () => {
      expectNoFailures(rows)
      expectNoTypeDrift(rows)
      for (const prefix of [
        "Tabel aplikasi yang belum ada",
        "Kolom yang belum ada di tabel yang sudah ada",
        "Kolom ekstra di production",
        "Nullability: kolom NOT NULL di migrasi",
        "CHECK constraint yang tidak dikenal migrasi",
        "Trigger yang tidak dikenal migrasi",
        "Tabel lain di skema public",
        "View di skema public",
      ]) {
        expect(check(rows, prefix).status, prefix).toBe("OK")
      }
    })

    it("ekspektasi kolom di skrip identik dengan katalog hasil migrasi (tipe & NOT NULL)", async () => {
      const expected = await db.query<{ item: string }>(
        `select tabel || '.' || kolom || ' ' || tipe || ' notnull=' || wajib_isi as item
         from pg_temp.pf_kolom_ekspektasi() order by 1`
      )
      const actual = await db.query<{ item: string }>(
        `select c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                || ' notnull=' || a.attnotnull as item
         from pg_class as c
         join pg_attribute as a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
         order by 1`
      )
      expect(expected.rows.map((row) => row.item)).toEqual(actual.rows.map((row) => row.item))
    })

    it("kolom uuid/jsonb/boolean dan post_items.state ditandai fatal", async () => {
      const mismatched = await db.query<{ item: string }>(
        `select tabel || '.' || kolom as item
         from pg_temp.pf_kolom_ekspektasi()
         where fatal <> (tipe in ('uuid', 'jsonb', 'boolean') or (tabel, kolom) = ('post_items', 'state'))`
      )
      expect(mismatched.rows).toEqual([])
    })

    it("ekspektasi CHECK di skrip identik dengan CHECK hasil migrasi", async () => {
      const expected = await db.query<{ item: string }>(
        "select tabel || '.' || nama as item from pg_temp.pf_check_ekspektasi() order by 1"
      )
      const actual = await db.query<{ item: string }>(
        `select conrelid::regclass::text || '.' || conname as item
         from pg_constraint
         where connamespace = 'public'::regnamespace and contype = 'c'
         order by 1`
      )
      expect(expected.rows.map((row) => row.item)).toEqual(actual.rows.map((row) => row.item))
    })

    it("versi migrasi di skrip identik dengan berkas supabase/migrations", async () => {
      const expected = await db.query<{ versi: string }>("select versi from pg_temp.pf_migrasi_ekspektasi()")
      const files = readMigrations().map((file) => file.name.split("_")[0])
      expect(expected.rows.map((row) => row.versi)).toEqual(files)
    })
  })

  describe("upgrade dari skema lama", () => {
    let legacy: { db: PGlite; data: LegacyData }
    let before: PreflightRow[]
    let after: PreflightRow[]

    beforeAll(async () => {
      legacy = await createLegacyDb()
      before = await runPreflight(legacy.db)
      await applyMigrationsAndSeed(legacy.db)
      after = await runPreflight(legacy.db)
    }, 60_000)

    afterAll(async () => {
      await legacy.db.close()
    })

    it("tidak ada GAGAL sebelum maupun sesudah migrasi; tanpa drift tipe sesudahnya", () => {
      expectNoFailures(before)
      expectNoFailures(after)
      expectNoTypeDrift(after)
    })

    it("objek yang tadinya INFO kini OK; data yang diubah migrasi sudah tidak tersisa", () => {
      for (const prefix of [
        "Tabel aplikasi yang belum ada",
        "Kolom yang belum ada di tabel yang sudah ada",
        "CHECK post_items_lease_check",
        "CHECK agent_runs_model_check",
        "CHECK constraint yang tidak dikenal migrasi",
        "Data fix Fase 0: failed_sync tanpa naskah",
        "uploaded_media.user_id kosong yang akan diisi",
        "Backfill kategori per baris",
      ]) {
        expect(check(after, prefix).status, prefix).toBe("OK")
      }
    })

    it("nullability kolom lama tidak diubah baseline: tetap dilaporkan (INFO, tanpa NULL)", () => {
      expect(check(after, "Nullability: kolom NOT NULL di migrasi").status).toBe("INFO")
    })
  })
})
