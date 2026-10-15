---
name: panitera-db-migration
description: Workflow perubahan skema database Panitera (Supabase CLI) — membuat migrasi idempoten, template RLS policy + GRANT per tabel, pola FK komposit anti lintas-tenant, aturan indeks, menambah test PGlite di supabase/tests, dan verifikasi/push ke production. Gunakan setiap kali menambah/mengubah tabel, kolom, constraint, indeks, policy RLS, trigger, atau seed.
---

# Panitera — Migrasi Database (Supabase CLI)

Sumber kebenaran skema: `supabase/migrations/*.sql` (baseline `20261015090000_baseline_schema.sql`).
Ringkasan model data & RLS: `ARCHITECTURE.md` §3. Muat juga skill `supabase-postgres-best-practices`.

## Larangan

- **Jangan** mengubah skema lewat skrip Management API (`.workspaces/scripts/migrate-*.js`), SQL editor
  dashboard, atau MCP `apply_migration` tanpa berkas migrasi di repo.
- Jangan mengedit migrasi yang sudah di-push — buat migrasi baru. Jangan menyentuh `.env*`.
- Jangan menambah state `post_items` di luar 9 state PRD §4 tanpa memperbarui PRD & ARCHITECTURE.

## Alur kerja

1. `npx supabase migration new <nama_snake_case>` → tulis SQL di berkas yang dibuat (jangan karang nama/timestamp).
2. SQL wajib idempoten: `create table if not exists`, `add column if not exists`,
   `create index if not exists`, CHECK/FK/policy/trigger via `drop ... if exists` lalu `create`.
3. Tabel baru → di migrasi yang sama: RLS `enable` + `force`, policy per operasi, `GRANT` eksplisit,
   trigger `set_updated_at` bila ada `updated_at`, indeks untuk setiap FK.
4. Tambah/ubah test di `supabase/tests/` lalu `npm run db:test` (PGlite, tanpa Docker), kemudian `npm test`.
5. Perbarui `ARCHITECTURE.md` §3 bila tabel/kolom/policy berubah.
6. Deploy (atas izin pengguna):
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db diff --linked            # butuh Docker; bandingkan migrasi vs production
   npx supabase db push --linked --dry-run
   npx supabase db push --linked            # seed tidak ikut kecuali --include-seed
   ```

## Template tabel tenant

```sql
create table if not exists public.contoh (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  wp_site_id uuid not null,
  nama text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contoh drop constraint if exists contoh_user_id_fkey;
alter table public.contoh add constraint contoh_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
-- FK komposit: induk wajib punya UNIQUE (id, user_id) (sudah ada di wp_sites, content_batches, post_items)
alter table public.contoh drop constraint if exists contoh_wp_site_id_fkey;
alter table public.contoh add constraint contoh_wp_site_id_fkey
  foreign key (wp_site_id, user_id) references public.wp_sites (id, user_id) on delete cascade;
-- FK nullable yang di-SET NULL wajib menyebut kolomnya: ... on delete set null (batch_id);

create index if not exists contoh_user_id_created_at_idx on public.contoh (user_id, created_at desc);
create index if not exists contoh_wp_site_id_idx on public.contoh (wp_site_id);

drop trigger if exists set_updated_at on public.contoh;
create trigger set_updated_at before update on public.contoh
  for each row execute function public.set_updated_at();

alter table public.contoh enable row level security;
alter table public.contoh force row level security;

drop policy if exists contoh_select_own on public.contoh;
create policy contoh_select_own on public.contoh
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists contoh_insert_own on public.contoh;
create policy contoh_insert_own on public.contoh
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists contoh_update_own on public.contoh;
create policy contoh_update_own on public.contoh
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists contoh_delete_own on public.contoh;
create policy contoh_delete_own on public.contoh
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.contoh from anon, authenticated;
grant select, insert, update, delete on table public.contoh to authenticated; -- hanya yang dipakai client sesi
grant select, insert, update, delete on table public.contoh to service_role;
```

Aturan policy: selalu `to authenticated` + `(select auth.uid())` (bukan `auth.role()`, bukan `user_metadata`);
UPDATE wajib `using` + `with check`; jangan pernah `user_id is null` sebagai jalan masuk. Tabel yang hanya
ditulis worker → `authenticated` cukup SELECT. Kolom state antrean (`post_items.state`, naskah,
`wp_post_id`) tidak boleh dapat di-UPDATE oleh client sesi.

## Aturan indeks

- Setiap FK punya indeks (kolom pertama = kolom FK); FK komposit cukup diindeks pada kolom FK-nya.
- Ikuti query nyata di `src/` (`.eq` → kolom depan, `.order` → kolom berikutnya); pertimbangkan indeks parsial
  untuk subset kecil (contoh: item in-flight antrean).
- Nama konsisten: `<tabel>_<kolom>_idx`, unik `<tabel>_<kolom>_key`. Hapus indeks yang tergantikan.

## Menambah test PGlite

Helper `supabase/tests/helpers/test-db.ts`: `createTestDb()` (prelude Supabase + semua migrasi + seed),
`seedTenant(db, label)`, `asUser(db, userId, fn)`, `asServiceRole`, `asAnon`, regex error
(`RLS_VIOLATION`, `PERMISSION_DENIED`, `FK_VIOLATION`, ...). Satu instance PGlite per berkas.

Contoh: `await expect(asUser(db, a.userId, (tx) => tx.query(sql, params))).rejects.toThrow(RLS_VIOLATION)`.

Tabel baru wajib ditambahkan ke `APP_TABLES` (helper), matriks `CASES` di `rls.test.ts`
(select/insert/update/delete lintas tenant + operasi milik sendiri), `seedTenant`, dan
`tests/fixtures/legacy-adhoc-schema.sql` bila relevan. `migrations.test.ts` sudah menguji idempotensi
dan konvergensi upgrade vs instalasi baru secara otomatis.

## Baseline vs production (sekali, sebelum push pertama)

1. Jalankan query pre-flight di header baseline (duplikat, rujukan lintas tenant, state tak dikenal) di
   SQL editor production → semua harus kosong; perbaiki data dulu bila tidak.
2. `npx supabase db diff --linked`: perbedaan kolom yang sudah ada (nullability/default/kolom lama seperti
   `encrypted_pexels_key`, tabel `prompt_templates`) tidak diubah baseline — putuskan di migrasi lanjutan.
3. `npx supabase db push --linked --dry-run`, lalu push. Baseline idempoten dan aman diterapkan di atas skema
   lama (diuji di `migrations.test.ts`); bila hanya ingin menandai tanpa menjalankan:
   `npx supabase migration repair --status applied <timestamp>` (hanya jika diff kosong).
