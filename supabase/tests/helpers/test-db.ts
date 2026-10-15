/**
 * Helper test database untuk migrasi Supabase tanpa Docker (PGlite, Postgres in-process).
 *
 * - `createTestDb()` membuat instance PGlite baru, memasang prelude Supabase (role API, auth.users,
 *   auth.uid()), lalu menerapkan seluruh `supabase/migrations/*.sql` berurutan + `supabase/seed.sql`.
 * - `asUser()` / `asAnon()` / `asServiceRole()` menjalankan callback di dalam transaksi dengan
 *   `set local role` + `request.jwt.claims` persis seperti PostgREST, lalu otomatis rollback bila
 *   callback melempar error.
 * - Query langsung ke `db` berjalan sebagai superuser `postgres` (melewati RLS): pakai untuk fixture
 *   dan verifikasi state akhir.
 *
 * Satu instance PGlite per berkas test (boot ± 2–3 detik).
 */
import { readFileSync, readdirSync } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PGlite, type Transaction } from "@electric-sql/pglite"

export const SUPABASE_DIR = fileURLToPath(new URL("../../", import.meta.url))
const MIGRATIONS_DIR = path.join(SUPABASE_DIR, "migrations")

/** 11 tabel aplikasi di skema `public` (urutan: induk → anak). */
export const APP_TABLES = [
  "wp_sites",
  "content_batches",
  "post_items",
  "execution_logs",
  "agent_profiles",
  "agent_runs",
  "agent_skills",
  "user_settings",
  "webhooks",
  "uploaded_media",
  "generation_checkpoints",
] as const

export type AppTable = (typeof APP_TABLES)[number]

export interface SqlFile {
  name: string
  sql: string
}

/** Seluruh migrasi diurutkan berdasarkan nama berkas (prefix timestamp Supabase CLI). */
export function readMigrations(): SqlFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(MIGRATIONS_DIR, name), "utf8") }))
}

export function readMigration(suffix: string): SqlFile {
  const found = readMigrations().find((file) => file.name.endsWith(suffix))
  if (!found) throw new Error(`Migrasi *${suffix} tidak ditemukan di ${MIGRATIONS_DIR}`)
  return found
}

export function readSupabaseFile(relativePath: string): string {
  return readFileSync(path.join(SUPABASE_DIR, relativePath), "utf8")
}

/** Jalankan satu berkas SQL di dalam transaksi (seperti `supabase db push` per migrasi). */
export async function runSqlFile(db: PGlite, file: SqlFile): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.exec(file.sql)
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Gagal menjalankan ${file.name}: ${message}`)
  }
}

/** Terapkan seluruh migrasi + seed (dipakai ulang untuk uji idempotensi). */
export async function applyMigrationsAndSeed(db: PGlite): Promise<void> {
  for (const migration of readMigrations()) {
    await runSqlFile(db, migration)
  }
  await runSqlFile(db, { name: "seed.sql", sql: readSupabaseFile("seed.sql") })
}

/** PGlite baru dengan prelude Supabase saja (tanpa migrasi). */
export async function createBareDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(readSupabaseFile("tests/helpers/supabase-prelude.sql"))
  return db
}

/** PGlite baru dengan prelude + seluruh migrasi + seed. */
export async function createTestDb(): Promise<PGlite> {
  const db = await createBareDb()
  await applyMigrationsAndSeed(db)
  return db
}

/** Hapus seluruh objek aplikasi (tabel + fungsi trigger) agar migrasi bisa diterapkan dari nol. */
export async function dropAppSchema(db: PGlite): Promise<void> {
  const tables = APP_TABLES.map((table) => `public.${table}`).join(", ")
  await db.exec(`drop table if exists ${tables} cascade; drop function if exists public.set_updated_at();`)
}

/**
 * Ringkasan katalog skema `public` yang deterministik: tabel (RLS/force/ACL), constraint
 * (kecuali NOT NULL), indeks, policy, trigger, fungsi (ACL), dan opsional kolom.
 */
export async function catalogSnapshot(db: PGlite, options: { columns: boolean }): Promise<string[]> {
  const columnsPart = options.columns
    ? `union all
       select 'column', table_name || '.' || column_name || ' ' || data_type || ' nullable=' || is_nullable
         || ' default=' || coalesce(column_default, '')
       from information_schema.columns
       where table_schema = 'public'`
    : ""
  const result = await db.query<{ item: string }>(`
    select kind || ' ' || item as item
    from (
      select 'table' as kind, c.relname || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity
        || ' acl=' || coalesce(c.relacl::text, '') as item
      from pg_class as c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      union all
      select 'constraint', conrelid::regclass::text || '.' || conname || ' ' || pg_get_constraintdef(oid)
      from pg_constraint
      where connamespace = 'public'::regnamespace and contype <> 'n'
      union all
      select 'index', tablename || '.' || indexname || ' ' || indexdef
      from pg_indexes
      where schemaname = 'public'
      union all
      select 'policy', tablename || '.' || policyname || ' ' || cmd || ' ' || array_to_string(roles, ',')
        || ' using=' || coalesce(qual, '') || ' check=' || coalesce(with_check, '')
      from pg_policies
      where schemaname = 'public'
      union all
      select 'trigger', t.tgrelid::regclass::text || '.' || t.tgname || ' enabled=' || t.tgenabled::text
      from pg_trigger as t
      join pg_class as c on c.oid = t.tgrelid
      where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
      union all
      select 'function', p.proname || ' acl=' || coalesce(p.proacl::text, '')
      from pg_proc as p
      where p.pronamespace = 'public'::regnamespace
      ${columnsPart}
    ) as s
    order by 1
  `)
  return result.rows.map((row) => row.item)
}

export async function createUser(db: PGlite, label = "user"): Promise<string> {
  const id = randomUUID()
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${label}-${id}@example.test`])
  return id
}

type ApiRole = "anon" | "authenticated" | "service_role"

async function withRole<T>(
  db: PGlite,
  role: ApiRole,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = userId ? { sub: userId, role } : { role }
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)])
    await tx.exec(`set local role ${role}`)
    return fn(tx)
  })
}

/** Jalankan sebagai pengguna login (`authenticated`, auth.uid() = userId). */
export function asUser<T>(db: PGlite, userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return withRole(db, "authenticated", userId, fn)
}

/** Jalankan sebagai pengunjung tanpa login (`anon`). */
export function asAnon<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return withRole(db, "anon", null, fn)
}

/** Jalankan sebagai Service Role (worker; BYPASSRLS). */
export function asServiceRole<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return withRole(db, "service_role", null, fn)
}

/** Satu baris di setiap tabel tenant, dimiliki satu pengguna. */
export interface TenantFixture {
  userId: string
  siteId: string
  batchId: string
  postId: string
  logId: string
  profileId: string
  runId: string
  skillId: string
  settingsId: string
  webhookId: string
  mediaId: string
  checkpointId: string
}

async function insertReturningId(db: PGlite, sql: string, params: unknown[]): Promise<string> {
  const result = await db.query<{ id: string }>(sql, params)
  const row = result.rows[0]
  if (!row) throw new Error(`Insert fixture tidak mengembalikan id: ${sql}`)
  return row.id
}

/** Buat pengguna + satu baris di setiap tabel miliknya (sebagai superuser, melewati RLS). */
export async function seedTenant(db: PGlite, label: string): Promise<TenantFixture> {
  const userId = await createUser(db, label)
  const siteId = await insertReturningId(
    db,
    `insert into public.wp_sites (user_id, site_name, base_url, wp_username, encrypted_app_password)
     values ($1, $2, $3, 'editor', 'iv:tag:cipher') returning id`,
    [userId, `Situs ${label}`, `https://${label}-${userId.slice(0, 8)}.example.test`]
  )
  const batchId = await insertReturningId(
    db,
    `insert into public.content_batches (user_id, wp_site_id, name, status, total_items)
     values ($1, $2, $3, 'running', 1) returning id`,
    [userId, siteId, `Batch ${label}`]
  )
  const postId = await insertReturningId(
    db,
    `insert into public.post_items (user_id, wp_site_id, batch_id, target_keyword, title, content_html, state)
     values ($1, $2, $3, $4, 'Judul', '<!-- wp:paragraph --><p>isi</p><!-- /wp:paragraph -->', 'ready_to_sync')
     returning id`,
    [userId, siteId, batchId, `keyword ${label}`]
  )
  const logId = await insertReturningId(
    db,
    `insert into public.execution_logs (post_item_id, user_id, step, message)
     values ($1, $2, 'init_queue', 'log') returning id`,
    [postId, userId]
  )
  const profileId = await insertReturningId(
    db,
    `insert into public.agent_profiles (user_id, name, mode, workflow_prompt)
     values ($1, $2, 'standard', 'Tulis artikel.') returning id`,
    [userId, `Profil ${label}`]
  )
  const runId = await insertReturningId(
    db,
    `insert into public.agent_runs (post_item_id, user_id, profile_ref, status)
     values ($1, $2, 'preset:quick-writer', 'completed') returning id`,
    [postId, userId]
  )
  const skillId = await insertReturningId(
    db,
    `insert into public.agent_skills (user_id, name, slug, content)
     values ($1, $2, 'gaya-brand', '# Gaya') returning id`,
    [userId, `Skill ${label}`]
  )
  const settingsId = await insertReturningId(
    db,
    `insert into public.user_settings (user_id, encrypted_openrouter_key) values ($1, 'iv:tag:cipher') returning id`,
    [userId]
  )
  const webhookId = await insertReturningId(
    db,
    `insert into public.webhooks (user_id, name, url, encrypted_secret, events)
     values ($1, 'Hook', 'https://hooks.example.test/in', 'iv:tag:cipher', '["post.published"]') returning id`,
    [userId]
  )
  const mediaId = await insertReturningId(
    db,
    `insert into public.uploaded_media (user_id, site_id, post_id, source_url, site_url, image_id)
     values ($1, $2, $3, 'https://images.example.test/a.jpg', 'https://site.example.test/a.jpg', 42) returning id`,
    [userId, siteId, postId]
  )

  const checkpointId = await insertReturningId(
    db,
    `insert into public.generation_checkpoints (post_item_id, user_id, step, schema_version, data)
     values ($1, $2, 'pre_resolve', 1, '{"inputKey": "fixture"}') returning id`,
    [postId, userId]
  )

  return { userId, siteId, batchId, postId, logId, profileId, runId, skillId, settingsId, webhookId, mediaId, checkpointId }
}

export async function countRows(db: PGlite | Transaction, table: AppTable, id: string): Promise<number> {
  const result = await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where id = $1`, [id])
  return result.rows[0]?.n ?? 0
}

/** Pesan error Postgres (untuk `expect(...).rejects.toThrow(...)`). */
export const RLS_VIOLATION = /row-level security policy/
export const PERMISSION_DENIED = /permission denied/
export const FK_VIOLATION = /violates foreign key constraint/
export const CHECK_VIOLATION = /violates check constraint/
export const UNIQUE_VIOLATION = /duplicate key value violates unique constraint/
export const NOT_NULL_VIOLATION = /null value in column/
