-- =============================================================================
-- Panitera · Data fixes Rombak v2 Fase 0
-- =============================================================================
-- Menyelaraskan data lama dengan perilaku worker setelah hotfix Fase 0. Idempoten: setiap
-- UPDATE hanya menyentuh baris yang masih berpola lama, jadi run kedua tidak mengubah apa pun.
-- Dijalankan oleh pemilik tabel (postgres, BYPASSRLS di Supabase) sehingga RLS tidak menyaring.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- (a) failed_sync tanpa naskah tersimpan → failed_generation
-- -----------------------------------------------------------------------------
-- Worker hanya menganggap naskah tersimpan bila content_html tidak kosong DAN title terisi
-- (`hasStoredArticle` di src/core/queue/worker.ts). Item `failed_sync` tanpa naskah selalu ditolak
-- Cost-Saver Retry (422 incomplete_content) dan tombol "Kirim ulang" tidak pernah berhasil;
-- sejak Fase 0 kegagalan tanpa naskah selalu `failed_generation` ("Tulis ulang").
-- Perpindahan state dicatat ke execution_logs sebagai jejak audit.
with fixed as (
  update public.post_items
  set state = 'failed_generation'
  where state = 'failed_sync'
    and (
      content_html is null
      or btrim(content_html) = ''
      or title is null
      or btrim(title) = ''
    )
  returning id, user_id
)
insert into public.execution_logs (post_item_id, user_id, step, level, message, details)
select
  fixed.id,
  fixed.user_id,
  'data_fix',
  'warn',
  '[Migrasi Fase 0] Status diubah dari failed_sync ke failed_generation karena naskah belum tersimpan; gunakan "Tulis ulang".',
  jsonb_build_object('previousState', 'failed_sync', 'nextState', 'failed_generation')
from fixed;


-- -----------------------------------------------------------------------------
-- (b) agent_profiles.limits: buang kuota per-tool untuk tool yang sudah dihapus
-- -----------------------------------------------------------------------------
-- `list_wp_categories`, `list_wp_tags`, `list_wp_authors` dihapus dari ToolRegistry (ADR-058);
-- kuotanya di `limits.perTool` adalah kunci mati. Hanya kunci itu yang dibuang — kunci lain
-- (termasuk `isDefault`) tidak disentuh.
--
-- SENGAJA TIDAK mereset `limits` menjadi `{"isDefault": <nilai lama>}` untuk baris yang terdampak
-- bug clampLimits lama (argumen tertukar → batas tersimpan memakai default mode yang salah):
-- dari data saja tidak bisa dibedakan baris yang terdampak bug dari batas yang memang diatur
-- pengguna, sehingga reset massal berisiko menghapus konfigurasi sah. Runtime tetap aman karena
-- setiap pembacaan melewati `resolveStoredAgentLimits()` → `clampLimits()` (batas sistem ditegakkan).
--
-- Trigger updated_at dimatikan sementara agar normalisasi teknis ini tidak mengubah
-- "terakhir diubah" milik pengguna.
alter table public.agent_profiles disable trigger set_updated_at;

update public.agent_profiles
set limits = jsonb_set(
  limits,
  '{perTool}',
  (limits -> 'perTool') - array['list_wp_categories', 'list_wp_tags', 'list_wp_authors']
)
where jsonb_typeof(limits -> 'perTool') = 'object'
  and (limits -> 'perTool') ?| array['list_wp_categories', 'list_wp_tags', 'list_wp_authors'];

alter table public.agent_profiles enable trigger set_updated_at;
