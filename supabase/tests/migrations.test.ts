/**
 * Migrasi: dapat diterapkan di atas skema ad-hoc production lama tanpa kehilangan data,
 * idempoten (aman dijalankan dua kali), konvergen dengan instalasi baru, dan data fix
 * Fase 0 hanya menyentuh baris berpola lama.
 *
 * Test di berkas ini berurutan dan berbagi satu instance PGlite:
 * skema lama → upgrade → idempotensi → drop & instalasi baru → pemeriksaan instalasi baru.
 */
import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  APP_TABLES,
  applyMigrationsAndSeed,
  catalogSnapshot,
  createBareDb,
  createUser,
  dropAppSchema,
  readMigration,
  readSupabaseFile,
  runSqlFile,
} from "./helpers/test-db"

const DEAD_TOOL_KEYS = ["list_wp_categories", "list_wp_tags", "list_wp_authors"]

let db: PGlite

interface LegacyRows {
  userId: string
  siteId: string
  orphanMediaId: string
  failedSyncEmptyId: string
  failedSyncStoredId: string
  profileId: string
  profileUpdatedAt: string
}
let legacy: LegacyRows

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<T>(sql, params)
  const row = result.rows[0]
  if (row === undefined) throw new Error(`Query tidak mengembalikan baris: ${sql}`)
  return row
}

beforeAll(async () => {
  db = await createBareDb()
  await db.exec(readSupabaseFile("tests/fixtures/legacy-adhoc-schema.sql"))

  const userId = await createUser(db, "legacy")
  const { id: siteId } = await one<{ id: string }>(
    `insert into public.wp_sites (user_id, site_name, base_url, wp_username, encrypted_app_password)
     values ($1, 'Lama', 'https://lama.example.test', 'editor', 'iv:tag:cipher') returning id`,
    [userId]
  )
  // Baris cache media tanpa pemilik (mungkin terjadi di skema lama: user_id nullable).
  const { id: orphanMediaId } = await one<{ id: string }>(
    `insert into public.uploaded_media (site_id, source_url, site_url, image_id)
     values ($1, 'https://img.example.test/a.jpg', 'https://lama.example.test/a.jpg', 10) returning id`,
    [siteId]
  )
  const { id: failedSyncEmptyId } = await one<{ id: string }>(
    `insert into public.post_items (user_id, wp_site_id, target_keyword, state, last_error)
     values ($1, $2, 'tanpa naskah', 'failed_sync', 'timeout') returning id`,
    [userId, siteId]
  )
  const { id: failedSyncStoredId } = await one<{ id: string }>(
    `insert into public.post_items (user_id, wp_site_id, target_keyword, state, title, content_html)
     values ($1, $2, 'ada naskah', 'failed_sync', 'Judul', '<p>isi</p>') returning id`,
    [userId, siteId]
  )
  const profile = await one<{ id: string; updated_at: string }>(
    `insert into public.agent_profiles (user_id, name, mode, workflow_prompt, limits, updated_at)
     values ($1, 'Profil lama', 'deep', 'w',
             '{"isDefault": true, "maxToolCalls": 20, "perTool": {"web_search": 5, "list_wp_tags": 3, "list_wp_authors": 1}}',
             '2026-01-01T00:00:00Z')
     returning id, updated_at::text`,
    [userId]
  )

  legacy = {
    userId,
    siteId,
    orphanMediaId,
    failedSyncEmptyId,
    failedSyncStoredId,
    profileId: profile.id,
    profileUpdatedAt: profile.updated_at,
  }
}, 60_000)

afterAll(async () => {
  await db.close()
})

describe("upgrade dari skema ad-hoc production lama", () => {
  it("baseline + data fix + seed berhasil diterapkan tanpa kehilangan data", async () => {
    await applyMigrationsAndSeed(db)

    const counts = await one<{ sites: number; posts: number; media: number }>(
      `select (select count(*) from public.wp_sites)::int as sites,
              (select count(*) from public.post_items)::int as posts,
              (select count(*) from public.uploaded_media)::int as media`
    )
    expect(counts).toEqual({ sites: 1, posts: 2, media: 1 })
  })

  it("uploaded_media tanpa pemilik diisi dari pemilik situs; policy `user_id IS NULL` hilang", async () => {
    const media = await one<{ user_id: string }>("select user_id from public.uploaded_media where id = $1", [
      legacy.orphanMediaId,
    ])
    expect(media.user_id).toBe(legacy.userId)

    const leaky = await db.query(
      `select policyname from pg_policies
       where schemaname = 'public' and (qual ilike '%user_id is null%' or with_check ilike '%user_id is null%')`
    )
    expect(leaky.rows).toEqual([])
  })

  it("kolom yang dibutuhkan kode ditambahkan (agent_profiles.skills, agent_runs.tokens_*)", async () => {
    const columns = await db.query<{ column: string }>(
      `select table_name || '.' || column_name as column
       from information_schema.columns
       where table_schema = 'public'
         and (table_name, column_name) in (('agent_profiles', 'skills'), ('agent_runs', 'tokens_prompt'),
                                           ('agent_runs', 'tokens_completion'))
       order by 1`
    )
    expect(columns.rows.map((row) => row.column)).toEqual([
      "agent_profiles.skills",
      "agent_runs.tokens_completion",
      "agent_runs.tokens_prompt",
    ])
  })

  it("data fix Fase 0: failed_sync tanpa naskah → failed_generation (+ log), yang bernaskah tetap", async () => {
    const states = await db.query<{ id: string; state: string }>(
      "select id, state from public.post_items where id = any($1::uuid[])",
      [[legacy.failedSyncEmptyId, legacy.failedSyncStoredId]]
    )
    const byId = Object.fromEntries(states.rows.map((row) => [row.id, row.state]))
    expect(byId[legacy.failedSyncEmptyId]).toBe("failed_generation")
    expect(byId[legacy.failedSyncStoredId]).toBe("failed_sync")

    const logs = await db.query<{ post_item_id: string; level: string }>(
      "select post_item_id, level from public.execution_logs where step = 'data_fix'"
    )
    expect(logs.rows).toEqual([{ post_item_id: legacy.failedSyncEmptyId, level: "warn" }])
  })

  it("data fix Fase 0: kuota perTool tool mati dibuang, kunci lain & updated_at tetap", async () => {
    const profile = await one<{ limits: Record<string, unknown>; updated_at: string }>(
      "select limits, updated_at::text from public.agent_profiles where id = $1",
      [legacy.profileId]
    )
    expect(profile.limits).toEqual({ isDefault: true, maxToolCalls: 20, perTool: { web_search: 5 } })
    expect(profile.updated_at).toBe(legacy.profileUpdatedAt)
  })

  it("idempoten: penerapan kedua tidak mengubah katalog maupun data", async () => {
    const catalogBefore = await catalogSnapshot(db, { columns: true })
    const dataBefore = await db.query("select state, updated_at from public.post_items order by id")
    const logsBefore = await one<{ n: number }>("select count(*)::int as n from public.execution_logs")

    await applyMigrationsAndSeed(db)

    expect(await catalogSnapshot(db, { columns: true })).toEqual(catalogBefore)
    expect((await db.query("select state, updated_at from public.post_items order by id")).rows).toEqual(
      dataBefore.rows
    )
    expect(await one<{ n: number }>("select count(*)::int as n from public.execution_logs")).toEqual(logsBefore)
  })

  it("konvergen: constraint, indeks, policy, trigger, RLS & grant sama persis dengan instalasi baru", async () => {
    const upgraded = await catalogSnapshot(db, { columns: false })

    await dropAppSchema(db)
    await applyMigrationsAndSeed(db)

    expect(await catalogSnapshot(db, { columns: false })).toEqual(upgraded)
  })
})

describe("instalasi baru", () => {
  it("idempoten: penerapan kedua menghasilkan katalog identik", async () => {
    const before = await catalogSnapshot(db, { columns: true })
    await applyMigrationsAndSeed(db)
    expect(await catalogSnapshot(db, { columns: true })).toEqual(before)
  })

  it("tepat 11 tabel di public; seluruhnya RLS enable + force dan punya policy", async () => {
    const tables = await db.query<{ relname: string; rls: boolean; force: boolean; policies: number }>(
      `select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force,
              (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
       from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       order by c.relname`
    )
    expect(tables.rows.map((row) => row.relname)).toEqual([...APP_TABLES].sort())
    for (const row of tables.rows) {
      expect(row, row.relname).toMatchObject({ rls: true, force: true })
      expect(row.policies, row.relname).toBeGreaterThan(0)
    }
  })

  it("policy hanya untuk role authenticated dan memakai (select auth.uid())", async () => {
    const policies = await db.query<{ name: string; roles: string; expr: string }>(
      `select tablename || '.' || policyname as name, array_to_string(roles, ',') as roles,
              coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
       from pg_policies where schemaname = 'public'`
    )
    for (const policy of policies.rows) {
      expect(policy.roles, policy.name).toBe("authenticated")
      expect(policy.expr, policy.name).toMatch(/\(?SELECT auth\.uid\(\) AS uid\)?/i)
    }
  })

  it("hak akses role API sesuai jalur aplikasi (anon tanpa akses; antrean & log tidak dapat diubah sesi)", async () => {
    const privileges = await db.query<{ tbl: string; role: string; granted: string | null }>(
      `select t.tbl, r.role,
              string_agg(p.priv, ',' order by p.priv)
                filter (where has_table_privilege(r.role, 'public.' || t.tbl, p.priv)) as granted
       from unnest($1::text[]) as t(tbl)
       cross join unnest(array['anon', 'authenticated']) as r(role)
       cross join unnest(array['DELETE', 'INSERT', 'SELECT', 'TRUNCATE', 'UPDATE']) as p(priv)
       group by t.tbl, r.role`,
      [[...APP_TABLES]]
    )
    const matrix = Object.fromEntries(privileges.rows.map((row) => [`${row.role}:${row.tbl}`, row.granted]))
    for (const table of APP_TABLES) expect(matrix[`anon:${table}`], table).toBeNull()

    const crud = "DELETE,INSERT,SELECT,UPDATE"
    expect({
      wp_sites: matrix["authenticated:wp_sites"],
      content_batches: matrix["authenticated:content_batches"],
      post_items: matrix["authenticated:post_items"],
      execution_logs: matrix["authenticated:execution_logs"],
      agent_profiles: matrix["authenticated:agent_profiles"],
      agent_runs: matrix["authenticated:agent_runs"],
      agent_skills: matrix["authenticated:agent_skills"],
      user_settings: matrix["authenticated:user_settings"],
      webhooks: matrix["authenticated:webhooks"],
      uploaded_media: matrix["authenticated:uploaded_media"],
      generation_checkpoints: matrix["authenticated:generation_checkpoints"],
    }).toEqual({
      wp_sites: crud,
      content_batches: crud,
      // INSERT hanya per kolom input antrean (GRANT kolom, migrasi queue_hardening).
      post_items: "DELETE,SELECT",
      execution_logs: "INSERT,SELECT",
      agent_profiles: crud,
      agent_runs: "SELECT",
      agent_skills: crud,
      user_settings: crud,
      webhooks: crud,
      uploaded_media: "SELECT",
      // Ditulis worker lewat RPC save_generation_checkpoint (service_role).
      generation_checkpoints: "SELECT",
    })

    const fn = await one<{ anon: boolean; authenticated: boolean }>(
      `select has_function_privilege('anon', 'public.set_updated_at()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.set_updated_at()', 'execute') as authenticated`
    )
    expect(fn).toEqual({ anon: false, authenticated: false })
  })

  it("skill sistem anti-ai-editor dari migrasi: tepat satu, menimpa isi lama, idempoten; seed tidak mengubahnya", async () => {
    const query = "select content, count(*) over ()::int as n, user_id from public.agent_skills where is_system and slug = 'anti-ai-editor'"
    const installed = await one<{ n: number; content: string; user_id: string | null }>(query)
    expect(installed.n).toBe(1)
    expect(installed.user_id).toBeNull()
    expect(installed.content).toMatch(/^---\nname: anti-ai-editor\n/)
    expect(installed.content).toContain("WRITING STYLE")

    await db.query("update public.agent_skills set content = 'versi lama production' where slug = 'anti-ai-editor'")
    await runSqlFile(db, { name: "seed.sql", sql: readSupabaseFile("seed.sql") })
    expect((await one<{ content: string }>(query)).content).toBe("versi lama production")

    const align = readMigration("_align_anti_ai_editor_skill.sql")
    await runSqlFile(db, align)
    await runSqlFile(db, align)
    expect(await one(query)).toEqual(installed)
  })

  it("data fix Fase 0 hanya menyentuh baris berpola lama dan aman dijalankan ulang", async () => {
    const userId = await createUser(db, "fix")
    const { id: siteId } = await one<{ id: string }>(
      `insert into public.wp_sites (user_id, site_name, base_url, wp_username, encrypted_app_password)
       values ($1, 'Fix', 'https://fix.example.test', 'editor', 'iv:tag:cipher') returning id`,
      [userId]
    )
    const insertItem = async (state: string, title: string | null, content: string | null) =>
      (
        await one<{ id: string }>(
          `insert into public.post_items (user_id, wp_site_id, target_keyword, state, title, content_html)
           values ($1, $2, 'kw', $3, $4, $5) returning id`,
          [userId, siteId, state, title, content]
        )
      ).id
    const blank = await insertItem("failed_sync", "Judul", "   ")
    const untitled = await insertItem("failed_sync", null, "<p>isi</p>")
    const stored = await insertItem("failed_sync", "Judul", "<p>isi</p>")
    const generationFailed = await insertItem("failed_generation", null, null)
    const { id: cleanProfile } = await one<{ id: string }>(
      `insert into public.agent_profiles (user_id, name, mode, workflow_prompt, limits)
       values ($1, 'Bersih', 'standard', 'w', '{"isDefault": false, "perTool": {"web_reader": 2}}') returning id`,
      [userId]
    )
    const { id: deadProfile } = await one<{ id: string }>(
      `insert into public.agent_profiles (user_id, name, mode, workflow_prompt, limits)
       values ($1, 'Mati', 'standard', 'w', $2) returning id`,
      [userId, JSON.stringify({ perTool: Object.fromEntries(DEAD_TOOL_KEYS.map((key) => [key, 2])) })]
    )

    const fix = readMigration("_fase0_data_fixes.sql")
    await runSqlFile(db, fix)
    await runSqlFile(db, fix)

    const states = await db.query<{ id: string; state: string }>(
      "select id, state from public.post_items where user_id = $1",
      [userId]
    )
    expect(Object.fromEntries(states.rows.map((row) => [row.id, row.state]))).toEqual({
      [blank]: "failed_generation",
      [untitled]: "failed_generation",
      [stored]: "failed_sync",
      [generationFailed]: "failed_generation",
    })

    const logs = await db.query<{ post_item_id: string }>(
      "select post_item_id from public.execution_logs where user_id = $1 and step = 'data_fix' order by post_item_id",
      [userId]
    )
    expect(logs.rows.map((row) => row.post_item_id)).toEqual([blank, untitled].sort())

    const limits = await db.query<{ id: string; limits: unknown }>(
      "select id, limits from public.agent_profiles where id = any($1::uuid[])",
      [[cleanProfile, deadProfile]]
    )
    expect(Object.fromEntries(limits.rows.map((row) => [row.id, row.limits]))).toEqual({
      [cleanProfile]: { isDefault: false, perTool: { web_reader: 2 } },
      [deadProfile]: { perTool: {} },
    })
  })
})
