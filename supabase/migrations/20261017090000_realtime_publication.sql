-- =============================================================================
-- Panitera · Realtime progres antrean (Rombak v2 · Fase 4)
-- =============================================================================
-- Dasbor memantau progres antrean lewat Supabase Realtime Postgres Changes (`postgres_changes`) dan
-- jatuh kembali ke polling bila kanal tidak tersambung. Migrasi ini mendaftarkan tabel yang
-- dipantau ke publication `supabase_realtime`:
--   - post_items     : transisi state, retry_count, last_error, wp_post_* (halaman Antrean & detail);
--   - execution_logs : log eksekusi live di halaman detail artikel.
--
-- Keamanan:
--   - Realtime mengotorisasi setiap event INSERT/UPDATE terhadap policy SELECT pemilik
--     (`(select auth.uid()) = user_id`, `to authenticated`) dengan JWT pelanggan — tenant hanya
--     menerima barisnya sendiri. Client juga memfilter `user_id=eq.<uid>` / `post_item_id=eq.<id>`.
--   - Event DELETE TIDAK melewati RLS (Postgres tidak dapat memverifikasi baris yang sudah terhapus);
--     dengan replica identity default (PK) payload DELETE hanya berisi `id`. Client SENGAJA tidak
--     berlangganan DELETE dan replica identity tidak diubah ke `full` (agar data baris lama tidak
--     ikut terkirim). Penghapusan dari UI sudah meng-invalidasi cache sendiri.
--   - Hanya dua tabel ini yang dipublikasikan. Tabel bersecret (`user_settings`, `wp_sites`,
--     `webhooks`) dan tabel lain TIDAK boleh ditambahkan ke publication.
--
-- Idempoten & portabel: hanya berjalan bila publication `supabase_realtime` ada (selalu ada di
-- Supabase; tidak ada di prelude test PGlite / Postgres polos) dan bukan `FOR ALL TABLES`; tabel yang
-- sudah terdaftar dilewati.
-- Deploy: setelah `db push`, Realtime Postgres Changes aktif untuk kedua tabel (cek Dashboard →
-- Database → Publications → supabase_realtime). Tidak ada perubahan skema/policy lain.
-- =============================================================================

do $$
declare
  target text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables
  ) then
    raise notice 'Publication supabase_realtime tidak ada (atau FOR ALL TABLES); realtime dilewati.';
    return;
  end if;

  foreach target in array array['post_items', 'execution_logs']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end;
$$;
