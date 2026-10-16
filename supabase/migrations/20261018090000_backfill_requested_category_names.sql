-- =============================================================================
-- Panitera · Backfill kategori per baris Tulis Terstruktur (Rombak v2 · Fase 5b, ADR-067)
-- =============================================================================
-- Sejak Fase 5b, kategori per baris Tulis Terstruktur disimpan sebagai
-- `post_items.source_payload.requested_category_names` dan dicocokkan pre-resolve ke kategori WordPress
-- yang sudah ada (mengalahkan kategori batch). Item yang dibuat sebelumnya (termasuk oleh aplikasi lama
-- di branch `main`) hanya menyimpan nama itu di kolom label `post_items.categories`, sehingga kategori
-- barisnya diabaikan worker. Migrasi ini menyalin label tersebut ke `requested_category_names` untuk item
-- yang BELUM diproses ulang, agar antrean yang sudah ada (mis. jadwal drip yang menunggu) ikut memakainya.
--
-- Hanya baris yang jelas berasal dari kategori per baris:
--   * item batch (`batch_id` terisi) yang masih akan menjalankan pre-resolve: `queued_input`, atau
--     `failed_generation` (dapat "Tulis ulang"); item yang naskahnya sudah ada (`ready_to_sync`, `failed_sync`,
--     state terbit) tidak disentuh karena kategorinya sudah ditetapkan saat naskah disimpan;
--   * belum punya `wp_post_id` dan belum punya kunci `requested_category_names`;
--   * `categories` berisi tepat satu nama (aplikasi lama menulis `[kategori_baris]` untuk baris berkategori),
--     dan BERBEDA dari `content_batches.ai_config.category_names` (label kategori tingkat batch yang ditulis
--     ke setiap item tanpa kategori baris — kategori itu sudah dipakai lewat `category_ids`).
-- Nama yang tidak ditemukan di WordPress tidak membuat kategori baru: pre-resolve jatuh ke kategori batch /
-- otomatis dan mencatat peringatan di log item. Checkpoint generasi item ini (bila ada) tidak dipakai lagi
-- karena sidik inputnya memuat nama kategori; item dari aplikasi lama memang belum punya checkpoint.
--
-- Idempoten: baris yang sudah punya `requested_category_names` dilewati. Trigger `set_updated_at` &
-- broadcast Realtime ikut berjalan (aman: hanya `updated_at` dan event status antrean milik pemilik item).
-- =============================================================================

update public.post_items as p
set source_payload = p.source_payload || jsonb_build_object('requested_category_names', p.categories)
from public.content_batches as b
where b.id = p.batch_id
  and b.user_id = p.user_id
  and p.state in ('queued_input', 'failed_generation')
  and p.wp_post_id is null
  and jsonb_typeof(p.source_payload) = 'object'
  and not (p.source_payload ? 'requested_category_names')
  and jsonb_typeof(p.categories) = 'array'
  and jsonb_array_length(p.categories) = 1
  and jsonb_typeof(p.categories -> 0) = 'string'
  and btrim(p.categories ->> 0) <> ''
  and p.categories is distinct from coalesce(b.ai_config -> 'category_names', '[]'::jsonb);
