-- =============================================================================
-- Panitera · Pre-flight upgrade production `main` → `v2` (READ-ONLY)
-- =============================================================================
-- Dijalankan di SQL Editor Supabase (role `postgres`) SEBELUM menerapkan supabase/migrations/* ke
-- production, dan boleh dijalankan ulang SETELAH migrasi sebagai verifikasi. Runbook:
-- docs/deploy/upgrade-ke-v2.md.
--
-- Hanya membaca katalog & data. Satu-satunya objek yang dibuat adalah fungsi sementara di skema
-- `pg_temp` milik sesi ini (hilang sendiri saat koneksi ditutup); skema aplikasi tidak disentuh.
--
-- Cara menjalankan:
--   * SQL Editor: tempel SELURUH berkas lalu Run (satu eksekusi = satu sesi; yang tampil = query terakhir).
--   * psql: psql "<KONEKSI_DIRECT_ATAU_SESSION_POOLER>" -f supabase/preflight/upgrade-v2.sql
--     Jangan lewat transaction pooler (port 6543): fungsi pg_temp dapat hilang di antara statement.
--
-- Hasil: satu tabel (pemeriksaan, status, jumlah, tindakan) dengan status:
--   GAGAL      — migrasi akan gagal / data melanggar constraint baru / v2 tidak akan berjalan benar.
--                Perbaiki SEBELUM `supabase db push`.
--   PERINGATAN — migrasi berjalan, tetapi ada risiko operasional atau keamanan; baca kolom tindakan.
--   INFO       — informasi: objek belum ada & akan dibuat migrasi, data yang akan dinormalkan migrasi.
--   OK         — tidak ada temuan.
-- Tabel/kolom yang belum ada di skema lama tidak membuat skrip gagal (dilaporkan INFO): setiap
-- pemeriksaan data dijalankan lewat SQL dinamis yang menangkap undefined_table/undefined_column.
--
-- Cakupan:
--   1. Prasyarat: PostgreSQL >= 15 (FK `on delete set null (kolom)`), role Data API, auth.users/auth.uid(),
--      hak pemilik objek aplikasi untuk role yang menjalankan migrasi, riwayat supabase_migrations.
--   2. Antrean: item in-flight (generating_content / syncing_to_wp) dan item yang menunggu.
--   3. Seluruh query pre-flight di header 20261015090000_baseline_schema.sql: duplikat UNIQUE, rujukan
--      lintas tenant (diperluas: rujukan yatim untuk setiap FK baru), state di luar 9-state.
--   4. Setiap CHECK / UNIQUE / NOT NULL / FK baru di semua migrasi yang dapat gagal pada data lama, plus
--      data yang akan diubah migrasi (data fix Fase 0, normalisasi retry_count & max_concurrency).
--   5. Realtime: publication supabase_realtime, skema Realtime, trigger Broadcast + policy topik privat.
--   6. Drift katalog: tipe & nullability kolom yang SUDAH ada (baseline tidak mengubahnya), kolom yang
--      belum ada/ekstra, CHECK & trigger yang tidak dikenal, tabel lain di skema public.
--
-- Sinkron dengan migrasi: daftar ekspektasi kolom (pf_kolom_ekspektasi), CHECK (pf_check_ekspektasi),
-- dan versi migrasi (pf_migrasi_ekspektasi) diuji supabase/tests/preflight.test.ts terhadap skema hasil
-- migrasi. Setiap perubahan supabase/migrations/* wajib memperbarui daftar ini (test gagal bila tidak).
-- =============================================================================

drop function if exists pg_temp.panitera_preflight();
drop function if exists pg_temp.pf_cek(integer, text, text, text, text);
drop function if exists pg_temp.pf_hitung(text);
drop function if exists pg_temp.pf_kolom_ekspektasi();
drop function if exists pg_temp.pf_check_ekspektasi();
drop function if exists pg_temp.pf_migrasi_ekspektasi();


-- -----------------------------------------------------------------------------
-- 1. Ekspektasi skema hasil migrasi
-- -----------------------------------------------------------------------------
-- Kolom 11 tabel aplikasi: tipe `format_type()`, NOT NULL, dan `fatal` = selisih tipe membuat migrasi
-- atau v2 gagal (uuid: FK komposit & id; jsonb: CHECK jsonb_typeof & operator jsonb; boolean: CHECK/indeks
-- parsial/filter; post_items.state: RPC claim_post_items menulis literal text).
create function pg_temp.pf_kolom_ekspektasi()
returns table (tabel text, kolom text, tipe text, wajib_isi boolean, fatal boolean)
language sql
immutable
as $fn$
  values
    -- wp_sites
    ('wp_sites', 'id', 'uuid', true, true),
    ('wp_sites', 'user_id', 'uuid', true, true),
    ('wp_sites', 'site_name', 'text', true, false),
    ('wp_sites', 'base_url', 'text', true, false),
    ('wp_sites', 'wp_username', 'text', true, false),
    ('wp_sites', 'encrypted_app_password', 'text', true, false),
    ('wp_sites', 'status', 'text', true, false),
    ('wp_sites', 'default_author_id', 'integer', false, false),
    ('wp_sites', 'default_category_id', 'integer', false, false),
    ('wp_sites', 'max_concurrency', 'integer', true, false),
    ('wp_sites', 'last_checked_at', 'timestamp with time zone', false, false),
    ('wp_sites', 'created_at', 'timestamp with time zone', true, false),
    ('wp_sites', 'updated_at', 'timestamp with time zone', true, false),
    -- content_batches
    ('content_batches', 'id', 'uuid', true, true),
    ('content_batches', 'user_id', 'uuid', true, true),
    ('content_batches', 'wp_site_id', 'uuid', false, true),
    ('content_batches', 'name', 'text', true, false),
    ('content_batches', 'source_type', 'text', true, false),
    ('content_batches', 'execution_mode', 'text', true, false),
    ('content_batches', 'ai_config', 'jsonb', true, true),
    ('content_batches', 'schedule_config', 'jsonb', true, true),
    ('content_batches', 'custom_instructions_override', 'text', false, false),
    ('content_batches', 'status', 'text', true, false),
    ('content_batches', 'total_items', 'integer', true, false),
    ('content_batches', 'completed_items', 'integer', true, false),
    ('content_batches', 'created_at', 'timestamp with time zone', true, false),
    ('content_batches', 'updated_at', 'timestamp with time zone', true, false),
    -- post_items
    ('post_items', 'id', 'uuid', true, true),
    ('post_items', 'batch_id', 'uuid', false, true),
    ('post_items', 'user_id', 'uuid', true, true),
    ('post_items', 'wp_site_id', 'uuid', true, true),
    ('post_items', 'target_keyword', 'text', true, false),
    ('post_items', 'source_payload', 'jsonb', true, true),
    ('post_items', 'title', 'text', false, false),
    ('post_items', 'slug', 'text', false, false),
    ('post_items', 'content_html', 'text', false, false),
    ('post_items', 'excerpt', 'text', false, false),
    ('post_items', 'featured_image_url', 'text', false, false),
    ('post_items', 'categories', 'jsonb', true, true),
    ('post_items', 'tags', 'jsonb', true, true),
    ('post_items', 'custom_instructions_override', 'text', false, false),
    ('post_items', 'state', 'text', true, true),
    ('post_items', 'scheduled_for', 'timestamp with time zone', false, false),
    ('post_items', 'wp_post_id', 'bigint', false, false),
    ('post_items', 'wp_post_url', 'text', false, false),
    ('post_items', 'wp_target_status', 'text', true, false),
    ('post_items', 'retry_count', 'integer', true, false),
    ('post_items', 'last_error', 'text', false, false),
    ('post_items', 'created_at', 'timestamp with time zone', true, false),
    ('post_items', 'updated_at', 'timestamp with time zone', true, false),
    ('post_items', 'locked_until', 'timestamp with time zone', false, false),
    ('post_items', 'locked_by', 'text', false, false),
    ('post_items', 'next_attempt_at', 'timestamp with time zone', false, false),
    -- execution_logs
    ('execution_logs', 'id', 'uuid', true, true),
    ('execution_logs', 'post_item_id', 'uuid', false, true),
    ('execution_logs', 'user_id', 'uuid', true, true),
    ('execution_logs', 'step', 'text', true, false),
    ('execution_logs', 'level', 'text', true, false),
    ('execution_logs', 'message', 'text', true, false),
    ('execution_logs', 'details', 'jsonb', true, true),
    ('execution_logs', 'created_at', 'timestamp with time zone', true, false),
    -- agent_profiles
    ('agent_profiles', 'id', 'uuid', true, true),
    ('agent_profiles', 'user_id', 'uuid', true, true),
    ('agent_profiles', 'name', 'text', true, false),
    ('agent_profiles', 'description', 'text', false, false),
    ('agent_profiles', 'mode', 'text', true, false),
    ('agent_profiles', 'model', 'text', false, false),
    ('agent_profiles', 'temperature', 'numeric(3,2)', true, false),
    ('agent_profiles', 'workflow_prompt', 'text', true, false),
    ('agent_profiles', 'tool_ids', 'text[]', true, false),
    ('agent_profiles', 'skills', 'text[]', true, false),
    ('agent_profiles', 'limits', 'jsonb', true, true),
    ('agent_profiles', 'based_on_preset', 'text', false, false),
    ('agent_profiles', 'version', 'integer', true, false),
    ('agent_profiles', 'is_archived', 'boolean', true, true),
    ('agent_profiles', 'created_at', 'timestamp with time zone', true, false),
    ('agent_profiles', 'updated_at', 'timestamp with time zone', true, false),
    -- agent_runs
    ('agent_runs', 'id', 'uuid', true, true),
    ('agent_runs', 'post_item_id', 'uuid', false, true),
    ('agent_runs', 'user_id', 'uuid', true, true),
    ('agent_runs', 'profile_ref', 'text', true, false),
    ('agent_runs', 'profile_snapshot', 'jsonb', true, true),
    ('agent_runs', 'status', 'text', true, false),
    ('agent_runs', 'stop_reason', 'text', false, false),
    ('agent_runs', 'model_calls', 'integer', true, false),
    ('agent_runs', 'tool_calls', 'integer', true, false),
    ('agent_runs', 'tokens_prompt', 'integer', false, false),
    ('agent_runs', 'tokens_completion', 'integer', false, false),
    ('agent_runs', 'duration_ms', 'integer', false, false),
    ('agent_runs', 'word_count', 'integer', false, false),
    ('agent_runs', 'error_message', 'text', false, false),
    ('agent_runs', 'created_at', 'timestamp with time zone', true, false),
    ('agent_runs', 'finished_at', 'timestamp with time zone', false, false),
    ('agent_runs', 'model', 'text', false, false),
    ('agent_runs', 'llm_calls', 'integer', true, false),
    ('agent_runs', 'tokens_total', 'integer', false, false),
    ('agent_runs', 'cost_usd', 'numeric(12,6)', false, false),
    ('agent_runs', 'model_usage', 'jsonb', true, true),
    ('agent_runs', 'prompt_versions', 'jsonb', true, true),
    ('agent_runs', 'resumed_steps', 'text[]', true, false),
    -- agent_skills
    ('agent_skills', 'id', 'uuid', true, true),
    ('agent_skills', 'user_id', 'uuid', false, true),
    ('agent_skills', 'name', 'text', true, false),
    ('agent_skills', 'slug', 'text', true, false),
    ('agent_skills', 'description', 'text', false, false),
    ('agent_skills', 'content', 'text', true, false),
    ('agent_skills', 'is_system', 'boolean', true, true),
    ('agent_skills', 'created_at', 'timestamp with time zone', true, false),
    ('agent_skills', 'updated_at', 'timestamp with time zone', true, false),
    -- user_settings
    ('user_settings', 'id', 'uuid', true, true),
    ('user_settings', 'user_id', 'uuid', true, true),
    ('user_settings', 'encrypted_openrouter_key', 'text', false, false),
    ('user_settings', 'encrypted_tavily_key', 'text', false, false),
    ('user_settings', 'encrypted_brave_key', 'text', false, false),
    ('user_settings', 'encrypted_serpapi_key', 'text', false, false),
    ('user_settings', 'encrypted_pexafy_key', 'text', false, false),
    ('user_settings', 'searxng_url', 'text', false, false),
    ('user_settings', 'search_preferences', 'jsonb', true, true),
    ('user_settings', 'notification_prefs', 'jsonb', true, true),
    ('user_settings', 'created_at', 'timestamp with time zone', true, false),
    ('user_settings', 'updated_at', 'timestamp with time zone', true, false),
    -- webhooks
    ('webhooks', 'id', 'uuid', true, true),
    ('webhooks', 'user_id', 'uuid', true, true),
    ('webhooks', 'name', 'text', true, false),
    ('webhooks', 'url', 'text', true, false),
    ('webhooks', 'encrypted_secret', 'text', true, false),
    ('webhooks', 'events', 'jsonb', true, true),
    ('webhooks', 'is_active', 'boolean', true, true),
    ('webhooks', 'created_at', 'timestamp with time zone', true, false),
    ('webhooks', 'updated_at', 'timestamp with time zone', true, false),
    -- uploaded_media
    ('uploaded_media', 'id', 'uuid', true, true),
    ('uploaded_media', 'user_id', 'uuid', true, true),
    ('uploaded_media', 'site_id', 'uuid', true, true),
    ('uploaded_media', 'post_id', 'uuid', false, true),
    ('uploaded_media', 'source_url', 'text', true, false),
    ('uploaded_media', 'site_url', 'text', true, false),
    ('uploaded_media', 'image_id', 'bigint', true, false),
    ('uploaded_media', 'metadata', 'jsonb', true, true),
    ('uploaded_media', 'created_at', 'timestamp with time zone', true, false),
    ('uploaded_media', 'updated_at', 'timestamp with time zone', true, false),
    -- generation_checkpoints
    ('generation_checkpoints', 'id', 'uuid', true, true),
    ('generation_checkpoints', 'post_item_id', 'uuid', true, true),
    ('generation_checkpoints', 'user_id', 'uuid', true, true),
    ('generation_checkpoints', 'step', 'text', true, false),
    ('generation_checkpoints', 'schema_version', 'integer', true, false),
    ('generation_checkpoints', 'data', 'jsonb', true, true),
    ('generation_checkpoints', 'prompt_versions', 'jsonb', true, true),
    ('generation_checkpoints', 'created_at', 'timestamp with time zone', true, false),
    ('generation_checkpoints', 'updated_at', 'timestamp with time zone', true, false)
$fn$;

-- CHECK constraint (nama per tabel) yang ada setelah seluruh migrasi diterapkan.
create function pg_temp.pf_check_ekspektasi()
returns table (tabel text, nama text)
language sql
immutable
as $fn$
  values
    ('agent_profiles', 'agent_profiles_limits_check'),
    ('agent_profiles', 'agent_profiles_mode_check'),
    ('agent_profiles', 'agent_profiles_name_check'),
    ('agent_profiles', 'agent_profiles_workflow_prompt_check'),
    ('agent_runs', 'agent_runs_metrics_check'),
    ('agent_runs', 'agent_runs_model_check'),
    ('agent_runs', 'agent_runs_model_usage_check'),
    ('agent_runs', 'agent_runs_profile_snapshot_check'),
    ('agent_runs', 'agent_runs_prompt_versions_check'),
    ('agent_runs', 'agent_runs_resumed_steps_check'),
    ('agent_runs', 'agent_runs_status_check'),
    ('agent_skills', 'agent_skills_name_check'),
    ('agent_skills', 'agent_skills_owner_check'),
    ('agent_skills', 'agent_skills_slug_check'),
    ('content_batches', 'content_batches_ai_config_check'),
    ('content_batches', 'content_batches_counters_check'),
    ('content_batches', 'content_batches_execution_mode_check'),
    ('content_batches', 'content_batches_schedule_config_check'),
    ('content_batches', 'content_batches_source_type_check'),
    ('content_batches', 'content_batches_status_check'),
    ('execution_logs', 'execution_logs_details_check'),
    ('execution_logs', 'execution_logs_level_check'),
    ('generation_checkpoints', 'generation_checkpoints_data_check'),
    ('generation_checkpoints', 'generation_checkpoints_prompt_versions_check'),
    ('generation_checkpoints', 'generation_checkpoints_schema_version_check'),
    ('generation_checkpoints', 'generation_checkpoints_step_check'),
    ('post_items', 'post_items_categories_check'),
    ('post_items', 'post_items_lease_check'),
    ('post_items', 'post_items_retry_count_check'),
    ('post_items', 'post_items_source_payload_check'),
    ('post_items', 'post_items_state_check'),
    ('post_items', 'post_items_tags_check'),
    ('post_items', 'post_items_wp_target_status_check'),
    ('uploaded_media', 'uploaded_media_metadata_check'),
    ('user_settings', 'user_settings_notification_prefs_check'),
    ('user_settings', 'user_settings_search_preferences_check'),
    ('webhooks', 'webhooks_events_check'),
    ('wp_sites', 'wp_sites_max_concurrency_check'),
    ('wp_sites', 'wp_sites_status_check')
$fn$;

-- Versi berkas supabase/migrations/* (urut).
create function pg_temp.pf_migrasi_ekspektasi()
returns table (versi text)
language sql
immutable
as $fn$
  values
    ('20261015090000'),
    ('20261015090001'),
    ('20261015100000'),
    ('20261015110000'),
    ('20261016090000'),
    ('20261017090000'),
    ('20261017100000'),
    ('20261018090000')
$fn$;


-- -----------------------------------------------------------------------------
-- 2. Helper SQL dinamis
-- -----------------------------------------------------------------------------
-- Jalankan `select count(*) ...`; objek yang belum ada → galat 'belum_ada', galat lain → pesan Postgres
-- (mis. fungsi tidak ada untuk tipe kolom yang berbeda).
create function pg_temp.pf_hitung(p_sql text, out n bigint, out galat text)
language plpgsql
as $fn$
begin
  execute p_sql into n;
exception
  when undefined_table or undefined_column or invalid_schema_name then
    galat := 'belum_ada';
  when others then
    galat := sqlerrm;
end;
$fn$;

-- Satu baris hasil dari satu query hitung: 0 → OK, > 0 → p_status + p_tindakan.
create function pg_temp.pf_cek(p_urut integer, p_pemeriksaan text, p_status text, p_tindakan text, p_sql text)
returns table (urut integer, pemeriksaan text, status text, jumlah bigint, tindakan text)
language plpgsql
as $fn$
declare
  hasil record;
begin
  select h.n, h.galat into hasil from pg_temp.pf_hitung(p_sql) as h;
  urut := p_urut;
  pemeriksaan := p_pemeriksaan;
  if hasil.galat = 'belum_ada' then
    status := 'INFO';
    tindakan := 'Tabel/kolom belum ada di skema ini; akan dibuat migrasi (tidak ada data lama untuk diperiksa).';
  elsif hasil.galat is not null then
    status := 'PERINGATAN';
    tindakan := 'Tidak dapat diperiksa: ' || hasil.galat
      || '. Periksa hak akses role ini (baris "Hak pemilik") atau baris "Drift tipe" untuk kolom terkait.';
  elsif hasil.n = 0 then
    status := 'OK';
    jumlah := 0;
    tindakan := '-';
  else
    status := p_status;
    jumlah := hasil.n;
    tindakan := p_tindakan;
  end if;
  return next;
end;
$fn$;


-- -----------------------------------------------------------------------------
-- 3. Pemeriksaan
-- -----------------------------------------------------------------------------
create function pg_temp.panitera_preflight()
returns table (urut integer, pemeriksaan text, status text, jumlah bigint, tindakan text)
language plpgsql
as $fn$
#variable_conflict use_column
declare
  tabel_app constant text[] := array[
    'wp_sites', 'content_batches', 'post_items', 'execution_logs', 'agent_profiles', 'agent_runs',
    'agent_skills', 'user_settings', 'webhooks', 'uploaded_media', 'generation_checkpoints'
  ];
  r record;
  hasil record;
  daftar text[];
  daftar_wajib text[];
  total bigint;
  ada integer;
  pub_semua boolean;
  realtime_ada boolean;
begin
  -- 3.1 Prasyarat ---------------------------------------------------------------------------------
  urut := 10;
  pemeriksaan := 'PostgreSQL >= 15';
  jumlah := null;
  if current_setting('server_version_num')::integer >= 150000 then
    status := 'OK';
    tindakan := 'Versi server: ' || current_setting('server_version') || '.';
  else
    status := 'GAGAL';
    tindakan := 'Versi server ' || current_setting('server_version')
      || ': baseline memakai FK `on delete set null (kolom)` (PostgreSQL 15+). Upgrade Postgres project dulu.';
  end if;
  return next;

  select array_agg(nama order by nama) into daftar
  from unnest(array['anon', 'authenticated', 'service_role']) as nama
  where not exists (select 1 from pg_roles where rolname = nama);
  urut := 11;
  pemeriksaan := 'Role Data API (anon, authenticated, service_role)';
  jumlah := coalesce(cardinality(daftar), 0);
  status := case when daftar is null then 'OK' else 'GAGAL' end;
  tindakan := case when daftar is null then '-'
    else 'Role tidak ada: ' || array_to_string(daftar, ', ') || '. GRANT/policy migrasi akan gagal; pastikan ini database Supabase.' end;
  return next;

  urut := 12;
  pemeriksaan := 'auth.users & auth.uid() tersedia';
  jumlah := null;
  if to_regclass('auth.users') is not null and to_regprocedure('auth.uid()') is not null then
    status := 'OK';
    tindakan := '-';
  else
    status := 'GAGAL';
    tindakan := 'FK pemilik (auth.users) dan policy RLS (auth.uid()) membutuhkan skema auth Supabase.';
  end if;
  return next;

  -- Migrasi (ALTER TABLE, policy, trigger, create or replace function) dijalankan role yang sama dengan
  -- pre-flight (postgres di SQL Editor / supabase db push) dan membutuhkan hak pemilik objek.
  select array_agg(o.nama || ' (pemilik ' || o.pemilik || ')' order by o.nama) into daftar
  from (
    select 'tabel ' || c.relname as nama, pg_get_userbyid(c.relowner) as pemilik, c.relowner as pemilik_oid
    from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and c.relname::text = any (tabel_app)
    union all
    select 'fungsi ' || p.proname, pg_get_userbyid(p.proowner), p.proowner
    from pg_proc as p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('set_updated_at', 'claim_post_items', 'extend_post_item_lease', 'save_generation_checkpoint',
                        'broadcast_post_item_update', 'broadcast_post_items_inserted',
                        'broadcast_post_items_deleted', 'broadcast_execution_log')
  ) as o
  where not pg_has_role(current_user, o.pemilik_oid, 'MEMBER');
  urut := 14;
  pemeriksaan := 'Hak pemilik objek aplikasi untuk role ' || current_user;
  jumlah := coalesce(cardinality(daftar), 0);
  status := case when daftar is null then 'OK' else 'GAGAL' end;
  tindakan := case when daftar is null then '-'
    else 'Bukan milik role ini: ' || array_to_string(daftar, ', ') || '. ALTER/policy/trigger migrasi akan ditolak '
      || '("must be owner"). Jalankan migrasi sebagai pemilik, atau ubah pemilik ke postgres lebih dulu.' end;
  return next;

  urut := 15;
  pemeriksaan := 'Riwayat migrasi supabase_migrations.schema_migrations';
  select h.n, h.galat into hasil
  from pg_temp.pf_hitung($q$
    select count(*) from supabase_migrations.schema_migrations as m
    where m.version in (select versi from pg_temp.pf_migrasi_ekspektasi())
  $q$) as h;
  if hasil.galat is not null then
    status := 'INFO';
    jumlah := null;
    tindakan := 'Belum ada riwayat migrasi (skema lama dibuat skrip ad-hoc). `supabase db push` membuat tabel '
      || 'riwayat lalu menerapkan ketujuh migrasi; jalur SQL Editor wajib diikuti `supabase migration repair`.';
  else
    jumlah := hasil.n;
    if hasil.n = 7 then
      status := 'OK';
      tindakan := 'Ketujuh migrasi v2 tercatat diterapkan.';
    elsif hasil.n = 0 then
      status := 'INFO';
      tindakan := 'Tabel riwayat ada, migrasi v2 belum tercatat; `supabase db push` akan menerapkan ketujuhnya.';
    else
      select array_agg(e.versi order by e.versi) into daftar
      from pg_temp.pf_migrasi_ekspektasi() as e
      where not exists (select 1 from supabase_migrations.schema_migrations as m where m.version = e.versi);
      status := 'PERINGATAN';
      tindakan := 'Sebagian migrasi v2 tercatat; belum: ' || array_to_string(daftar, ', ')
        || '. Lanjutkan `supabase db push` (migrasi idempoten) lalu jalankan ulang pre-flight.';
    end if;
  end if;
  return next;

  -- 3.2 Antrean -------------------------------------------------------------------------------------
  return query
  select c.*
  from (
    values
      (20, 'Antrean in-flight (generating_content / syncing_to_wp)', 'PERINGATAN',
       'Sebelum migrasi: tunggu angka ini 0 sebelum menghentikan aplikasi lama. Item yang tersisa dipulihkan '
       || 'runner v2 ±15 menit setelah updated_at terakhir: generating_content → antre ulang (retry_count+1), '
       || 'syncing_to_wp → failed_sync (atau sukses bila wp_post_id tercatat); cek wp-admin sebelum "Kirim ulang". '
       || 'Setelah deploy: angka > 0 normal selama runner bekerja.',
       $q$select count(*) from public.post_items where state in ('generating_content', 'syncing_to_wp')$q$),
      (21, 'Antrean menunggu (queued_input / ready_to_sync)', 'INFO',
       'Diproses runner v2 begitu aplikasi baru berjalan (drip tetap mengikuti scheduled_for). Tidak perlu tindakan.',
       $q$select count(*) from public.post_items where state in ('queued_input', 'ready_to_sync')$q$)
  ) as v (urut, nama, status, tindakan, sql)
  cross join lateral pg_temp.pf_cek(v.urut, v.nama, v.status, v.tindakan, v.sql) as c;

  -- 3.3 UNIQUE & owner (header baseline) --------------------------------------------------------------
  return query
  select c.*
  from (
    values
      (100, 'UNIQUE wp_sites (user_id, base_url): situs ganda per tenant', 'GAGAL',
       'Jumlah = pasangan (user_id, base_url) ganda. Pertahankan satu situs: pindahkan dulu post_items, '
       || 'content_batches, uploaded_media ke situs itu, lalu hapus duplikatnya (setelah backup).',
       $q$select count(*) from (select 1 from public.wp_sites group by user_id, base_url having count(*) > 1) as d$q$),
      (101, 'UNIQUE agent_skills (user_id, slug): skill tenant ganda', 'GAGAL',
       'Jumlah = pasangan (user_id, slug) ganda. Ganti slug atau hapus salah satu skill.',
       $q$select count(*) from (
            select 1 from public.agent_skills where user_id is not null group by user_id, slug having count(*) > 1
          ) as d$q$),
      (102, 'UNIQUE agent_skills slug sistem (is_system): skill sistem ganda', 'GAGAL',
       'Jumlah = slug skill sistem ganda. Hapus duplikat (pertahankan satu baris per slug).',
       $q$select count(*) from (select 1 from public.agent_skills where is_system group by slug having count(*) > 1) as d$q$),
      (103, 'UNIQUE user_settings (user_id): lebih dari satu baris per tenant', 'GAGAL',
       'Jumlah = tenant dengan > 1 baris. Gabungkan kunci terenkripsi ke satu baris lalu hapus sisanya.',
       $q$select count(*) from (
            select 1 from public.user_settings where user_id is not null group by user_id having count(*) > 1
          ) as d$q$),
      (104, 'CHECK agent_skills_owner_check: is_system tidak sesuai user_id', 'GAGAL',
       'Skill sistem wajib user_id NULL, skill tenant wajib user_id terisi. Perbaiki is_system/user_id.',
       $q$select count(*) from public.agent_skills where is_system = (user_id is not null)$q$)
  ) as v (urut, nama, status, tindakan, sql)
  cross join lateral pg_temp.pf_cek(v.urut, v.nama, v.status, v.tindakan, v.sql) as c;

  -- 3.4 FK pemilik user_id → auth.users (setiap tabel) ------------------------------------------------
  total := 0;
  daftar := array[]::text[];
  for r in select unnest(tabel_app) as nama loop
    select h.n, h.galat into hasil
    from pg_temp.pf_hitung(format(
      'select count(*) from public.%I as t where t.user_id is not null '
      || 'and not exists (select 1 from auth.users as u where u.id = t.user_id)',
      r.nama
    )) as h;
    if hasil.galat is null and hasil.n > 0 then
      total := total + hasil.n;
      daftar := daftar || (r.nama || ': ' || hasil.n);
    elsif hasil.galat is not null and hasil.galat <> 'belum_ada' then
      daftar := daftar || (r.nama || ': tidak dapat diperiksa (' || hasil.galat || ')');
    end if;
  end loop;
  urut := 200;
  pemeriksaan := 'FK user_id → auth.users: baris milik akun yang sudah tidak ada';
  jumlah := total;
  if cardinality(daftar) = 0 then
    status := 'OK';
    tindakan := '-';
  elsif total > 0 then
    status := 'GAGAL';
    tindakan := 'FK pemilik baru (ON DELETE CASCADE) akan menolak baris yatim: ' || array_to_string(daftar, '; ')
      || '. Hapus baris tersebut (setelah backup).';
  else
    status := 'PERINGATAN';
    tindakan := array_to_string(daftar, '; ')
      || '. Periksa hak akses role ini (baris "Hak pemilik") atau baris "Drift tipe" untuk kolom user_id.';
  end if;
  return next;

  -- 3.5 FK komposit anti lintas-tenant (header baseline + rujukan yatim) -------------------------------
  return query
  select c.*
  from (
    values
      (210, 'FK content_batches (wp_site_id, user_id) → wp_sites: yatim/lintas tenant', 'GAGAL',
       'Batch merujuk situs yang tidak ada atau milik tenant lain. Arahkan ke situs milik tenant yang sama, '
       || 'set wp_site_id NULL, atau hapus batch (setelah backup).',
       $q$select count(*) from public.content_batches as b
          where b.wp_site_id is not null
            and not exists (select 1 from public.wp_sites as s where s.id = b.wp_site_id and s.user_id = b.user_id)$q$),
      (211, 'FK post_items (wp_site_id, user_id) → wp_sites: yatim/lintas tenant', 'GAGAL',
       'Item merujuk situs yang tidak ada atau milik tenant lain. Perbaiki user_id/wp_site_id atau hapus item.',
       $q$select count(*) from public.post_items as p
          where p.wp_site_id is not null
            and not exists (select 1 from public.wp_sites as s where s.id = p.wp_site_id and s.user_id = p.user_id)$q$),
      (212, 'FK post_items (batch_id, user_id) → content_batches: yatim/lintas tenant', 'GAGAL',
       'Item merujuk batch yang tidak ada atau milik tenant lain. Set batch_id NULL atau perbaiki rujukan.',
       $q$select count(*) from public.post_items as p
          where p.batch_id is not null
            and not exists (select 1 from public.content_batches as b where b.id = p.batch_id and b.user_id = p.user_id)$q$),
      (213, 'FK execution_logs (post_item_id, user_id) → post_items: yatim/lintas tenant', 'GAGAL',
       'Log merujuk item yang tidak ada atau milik tenant lain. Samakan user_id dengan pemilik item atau hapus log.',
       $q$select count(*) from public.execution_logs as l
          where l.post_item_id is not null
            and not exists (select 1 from public.post_items as p where p.id = l.post_item_id and p.user_id = l.user_id)$q$),
      (214, 'FK agent_runs (post_item_id, user_id) → post_items: yatim/lintas tenant', 'GAGAL',
       'Run merujuk item yang tidak ada atau milik tenant lain. Samakan user_id dengan pemilik item atau hapus run.',
       $q$select count(*) from public.agent_runs as r
          where r.post_item_id is not null
            and not exists (select 1 from public.post_items as p where p.id = r.post_item_id and p.user_id = r.user_id)$q$),
      (215, 'FK uploaded_media (site_id, user_id) → wp_sites: lintas tenant', 'GAGAL',
       'Cache media dengan user_id berbeda dari pemilik situs. Hapus barisnya (hanya cache deduplikasi).',
       $q$select count(*) from public.uploaded_media as m
          where m.user_id is not null
            and not exists (select 1 from public.wp_sites as s where s.id = m.site_id and s.user_id = m.user_id)$q$),
      (216, 'FK uploaded_media (post_id, user_id) → post_items: yatim/lintas tenant', 'GAGAL',
       'Cache media merujuk item yang tidak ada atau milik tenant lain. Set post_id NULL (hanya cache).',
       $q$select count(*) from public.uploaded_media as m
          where m.post_id is not null
            and not exists (
              select 1 from public.post_items as p
              where p.id = m.post_id
                and p.user_id = coalesce(m.user_id, (select s.user_id from public.wp_sites as s where s.id = m.site_id))
            )$q$)
  ) as v (urut, nama, status, tindakan, sql)
  cross join lateral pg_temp.pf_cek(v.urut, v.nama, v.status, v.tindakan, v.sql) as c;

  -- 3.6 NOT NULL baru (baseline §2) --------------------------------------------------------------------
  return query
  select c.*
  from (
    values
      (300, 'NOT NULL uploaded_media.user_id: cache tanpa pemilik yang tidak dapat diisi', 'GAGAL',
       'Baris tanpa user_id yang situsnya sudah tidak ada; baseline mengisi user_id dari pemilik situs lalu '
       || 'menegakkan NOT NULL. Hapus baris ini (hanya cache deduplikasi media).',
       $q$select count(*) from public.uploaded_media as m
          where m.user_id is null and not exists (select 1 from public.wp_sites as s where s.id = m.site_id)$q$),
      (301, 'uploaded_media.user_id kosong yang akan diisi dari pemilik situs', 'INFO',
       'Diisi otomatis baseline dari wp_sites.user_id; policy lama `user_id IS NULL` yang bocor ikut dihapus. '
       || 'Tidak perlu tindakan.',
       $q$select count(*) from public.uploaded_media as m
          where m.user_id is null and exists (select 1 from public.wp_sites as s where s.id = m.site_id)$q$),
      (302, 'NOT NULL user_settings.user_id', 'GAGAL',
       'Baris pengaturan tanpa pemilik tidak dapat dipakai siapa pun. Hapus (setelah backup).',
       $q$select count(*) from public.user_settings where user_id is null$q$),
      (303, 'NOT NULL webhooks.user_id', 'GAGAL',
       'Webhook tanpa pemilik. Hapus (setelah backup).',
       $q$select count(*) from public.webhooks where user_id is null$q$)
  ) as v (urut, nama, status, tindakan, sql)
  cross join lateral pg_temp.pf_cek(v.urut, v.nama, v.status, v.tindakan, v.sql) as c;

  -- 3.7 CHECK baru di semua migrasi (NULL lolos CHECK, sama seperti Postgres) --------------------------
  return query
  select c.*
  from (
    values
      (400, 'CHECK wp_sites_status_check', 'GAGAL',
       'Status di luar connected|auth_error|rate_limited|unreachable. Set ke salah satunya (mis. connected).',
       $q$select count(*) from public.wp_sites
          where status not in ('connected', 'auth_error', 'rate_limited', 'unreachable')$q$),
      (401, 'CHECK wp_sites_max_concurrency_check (< 1)', 'GAGAL',
       'max_concurrency < 1 tidak dapat dinormalkan migrasi. Set ke 2 (default).',
       $q$select count(*) from public.wp_sites where max_concurrency < 1$q$),
      (410, 'CHECK content_batches_source_type_check', 'GAGAL',
       'source_type di luar csv_keywords|niche_auto|external_url|manual. Set ke manual.',
       $q$select count(*) from public.content_batches
          where source_type not in ('csv_keywords', 'niche_auto', 'external_url', 'manual')$q$),
      (411, 'CHECK content_batches_execution_mode_check', 'GAGAL',
       'execution_mode di luar immediate|scheduled_drip|wp_future. Perbaiki sesuai jadwal batch.',
       $q$select count(*) from public.content_batches
          where execution_mode not in ('immediate', 'scheduled_drip', 'wp_future')$q$),
      (412, 'CHECK content_batches_status_check', 'GAGAL',
       'status di luar draft|running|paused|completed|failed. Perbaiki statusnya.',
       $q$select count(*) from public.content_batches
          where status not in ('draft', 'running', 'paused', 'completed', 'failed')$q$),
      (413, 'CHECK content_batches_counters_check', 'GAGAL',
       'total_items/completed_items negatif. Set ke 0 (progres dihitung ulang runner).',
       $q$select count(*) from public.content_batches where total_items < 0 or completed_items < 0$q$),
      (414, 'CHECK content_batches_ai_config_check', 'GAGAL',
       'ai_config bukan objek JSON. Set ke ''{}''::jsonb.',
       $q$select count(*) from public.content_batches where jsonb_typeof(ai_config) <> 'object'$q$),
      (415, 'CHECK content_batches_schedule_config_check', 'GAGAL',
       'schedule_config bukan objek JSON. Set ke ''{}''::jsonb.',
       $q$select count(*) from public.content_batches where jsonb_typeof(schedule_config) <> 'object'$q$),
      (420, 'CHECK post_items_state_check: state di luar 9-state PRD §4', 'GAGAL',
       'State tidak dikenal (lihat query header baseline untuk rinciannya). Petakan ke salah satu 9 state, '
       || 'mis. failed_generation (tanpa naskah) atau failed_sync (naskah tersimpan).',
       $q$select count(*) from public.post_items
          where state not in ('queued_input', 'generating_content', 'ready_to_sync', 'syncing_to_wp',
            'published_on_wp', 'scheduled_on_wp', 'saved_draft_on_wp', 'failed_generation', 'failed_sync')$q$),
      (421, 'post_items.state NULL', 'PERINGATAN',
       'Lolos CHECK (NULL) tetapi tidak pernah diklaim runner maupun tampil benar di dasbor. Set state yang sesuai.',
       $q$select count(*) from public.post_items where state is null$q$),
      (422, 'CHECK post_items_wp_target_status_check', 'GAGAL',
       'wp_target_status di luar publish|future|draft. Set ke draft.',
       $q$select count(*) from public.post_items where wp_target_status not in ('publish', 'future', 'draft')$q$),
      (423, 'CHECK post_items_retry_count_check (< 0)', 'GAGAL',
       'retry_count negatif. Set ke 0.',
       $q$select count(*) from public.post_items where retry_count < 0$q$),
      (424, 'CHECK post_items_source_payload_check', 'GAGAL',
       'source_payload bukan objek JSON. Set ke ''{}''::jsonb.',
       $q$select count(*) from public.post_items where jsonb_typeof(source_payload) <> 'object'$q$),
      (425, 'CHECK post_items_categories_check', 'GAGAL',
       'categories bukan array JSON. Set ke ''[]''::jsonb.',
       $q$select count(*) from public.post_items where jsonb_typeof(categories) <> 'array'$q$),
      (426, 'CHECK post_items_tags_check', 'GAGAL',
       'tags bukan array JSON. Set ke ''[]''::jsonb.',
       $q$select count(*) from public.post_items where jsonb_typeof(tags) <> 'array'$q$),
      (427, 'CHECK post_items_lease_check', 'GAGAL',
       'locked_until/locked_by tidak berpasangan atau locked_by > 200 karakter. Kosongkan keduanya.',
       $q$select count(*) from public.post_items
          where (locked_until is null) <> (locked_by is null)
             or char_length(locked_by) not between 1 and 200$q$),
      (430, 'CHECK execution_logs_level_check', 'GAGAL',
       'level di luar info|warn|error. Petakan (mis. success → info, warning → warn).',
       $q$select count(*) from public.execution_logs where level not in ('info', 'warn', 'error')$q$),
      (431, 'CHECK execution_logs_details_check', 'GAGAL',
       'details bukan objek JSON. Set ke ''{}''::jsonb.',
       $q$select count(*) from public.execution_logs where jsonb_typeof(details) <> 'object'$q$),
      (440, 'CHECK agent_profiles_name_check (2–100 karakter)', 'GAGAL',
       'Nama Agent Profile terlalu pendek/panjang. Ubah nama.',
       $q$select count(*) from public.agent_profiles where char_length(name) not between 2 and 100$q$),
      (441, 'CHECK agent_profiles_mode_check', 'GAGAL',
       'mode di luar standard|deep. Set ke standard.',
       $q$select count(*) from public.agent_profiles where mode not in ('standard', 'deep')$q$),
      (442, 'CHECK agent_profiles_workflow_prompt_check (≤ 12000 karakter)', 'GAGAL',
       'workflow_prompt melebihi 12000 karakter. Persingkat.',
       $q$select count(*) from public.agent_profiles where char_length(workflow_prompt) > 12000$q$),
      (443, 'CHECK agent_profiles_limits_check', 'GAGAL',
       'limits bukan objek JSON. Set ke ''{}''::jsonb (batas sistem tetap ditegakkan clampLimits).',
       $q$select count(*) from public.agent_profiles where jsonb_typeof(limits) <> 'object'$q$),
      (450, 'CHECK agent_runs_status_check', 'GAGAL',
       'status di luar running|completed|failed. Set ke failed.',
       $q$select count(*) from public.agent_runs where status not in ('running', 'completed', 'failed')$q$),
      (451, 'CHECK agent_runs_profile_snapshot_check', 'GAGAL',
       'profile_snapshot bukan objek JSON. Set ke ''{}''::jsonb.',
       $q$select count(*) from public.agent_runs where jsonb_typeof(profile_snapshot) <> 'object'$q$),
      (452, 'CHECK agent_runs_model_check (kolom model sudah ada)', 'GAGAL',
       'model kosong atau > 200 karakter. Set NULL.',
       $q$select count(*) from public.agent_runs where char_length(model) not between 1 and 200$q$),
      (453, 'CHECK agent_runs_metrics_check (kolom metrik sudah ada)', 'GAGAL',
       'llm_calls/tokens_total/cost_usd negatif. Set 0/NULL.',
       $q$select count(*) from public.agent_runs where llm_calls < 0 or tokens_total < 0 or cost_usd < 0$q$),
      (454, 'CHECK agent_runs_model_usage_check (kolom sudah ada)', 'GAGAL',
       'model_usage bukan array JSON. Set ke ''[]''::jsonb.',
       $q$select count(*) from public.agent_runs where jsonb_typeof(model_usage) <> 'array'$q$),
      (455, 'CHECK agent_runs_prompt_versions_check (kolom sudah ada)', 'GAGAL',
       'prompt_versions bukan objek JSON. Set ke ''{}''::jsonb.',
       $q$select count(*) from public.agent_runs where jsonb_typeof(prompt_versions) <> 'object'$q$),
      (456, 'CHECK agent_runs_resumed_steps_check (kolom sudah ada)', 'GAGAL',
       'resumed_steps memuat nilai selain pre_resolve|draft. Set ke ''{}''.',
       $q$select count(*) from public.agent_runs
          where not (resumed_steps <@ array['pre_resolve', 'draft']::text[])$q$),
      (460, 'CHECK agent_skills_name_check (2–120 karakter)', 'GAGAL',
       'Nama skill terlalu pendek/panjang. Ubah nama.',
       $q$select count(*) from public.agent_skills where char_length(name) not between 2 and 120$q$),
      (461, 'CHECK agent_skills_slug_check (^[a-z0-9_-]+$)', 'GAGAL',
       'Slug memuat huruf besar, spasi, atau tanda baca lain. Ubah ke huruf kecil/angka/_/- (unik per pemilik).',
       $q$select count(*) from public.agent_skills where slug !~ '^[a-z0-9_-]+$'$q$),
      (470, 'CHECK user_settings_search_preferences_check', 'GAGAL',
       'search_preferences bukan objek JSON. Set ke ''{"default_provider": "auto"}''::jsonb.',
       $q$select count(*) from public.user_settings where jsonb_typeof(search_preferences) <> 'object'$q$),
      (471, 'CHECK user_settings_notification_prefs_check', 'GAGAL',
       'notification_prefs bukan objek JSON. Set ke ''{}''::jsonb.',
       $q$select count(*) from public.user_settings where jsonb_typeof(notification_prefs) <> 'object'$q$),
      (480, 'CHECK webhooks_events_check', 'GAGAL',
       'events bukan array JSON. Set ke ''[]''::jsonb.',
       $q$select count(*) from public.webhooks where jsonb_typeof(events) <> 'array'$q$),
      (490, 'CHECK uploaded_media_metadata_check', 'GAGAL',
       'metadata bukan objek JSON. Set ke ''{}''::jsonb.',
       $q$select count(*) from public.uploaded_media where jsonb_typeof(metadata) <> 'object'$q$)
  ) as v (urut, nama, status, tindakan, sql)
  cross join lateral pg_temp.pf_cek(v.urut, v.nama, v.status, v.tindakan, v.sql) as c;

  -- 3.8 Data yang akan diubah migrasi & dampak ke pengguna (informasi) ----------------------------------
  return query
  select c.*
  from (
    values
      (500, 'Data fix Fase 0: failed_sync tanpa naskah → failed_generation', 'INFO',
       'Dipindah migrasi 20261015090001 + dicatat di execution_logs (step data_fix); di dasbor gunakan '
       || '"Tulis ulang". Tidak perlu tindakan.',
       $q$select count(*) from public.post_items
          where state = 'failed_sync'
            and (content_html is null or btrim(content_html) = '' or title is null or btrim(title) = '')$q$),
      (501, 'Data fix Fase 0: kuota perTool untuk tool yang dihapus', 'INFO',
       'Kunci list_wp_categories/list_wp_tags/list_wp_authors dibuang dari agent_profiles.limits.perTool '
       || '(updated_at tidak berubah). Tidak perlu tindakan.',
       $q$select count(*) from public.agent_profiles
          where jsonb_typeof(limits -> 'perTool') = 'object'
            and (limits -> 'perTool') ?| array['list_wp_categories', 'list_wp_tags', 'list_wp_authors']$q$),
      (502, 'Normalisasi post_items.retry_count > 1000 → 1000', 'INFO',
       'Dinormalkan migrasi 20261015110000 sebelum CHECK 0..1000 dipasang. Tidak perlu tindakan.',
       $q$select count(*) from public.post_items where retry_count > 1000$q$),
      (504, 'Backfill kategori per baris Tulis Terstruktur (item menunggu)', 'INFO',
       'Migrasi 20261018090000 menyalin kategori baris (label `categories`) ke source_payload.requested_category_names '
       || 'agar dicocokkan ke kategori WordPress yang ada saat diproses. Nama yang tidak ditemukan tidak membuat '
       || 'kategori baru (jatuh ke kategori batch). Tidak perlu tindakan.',
       $q$select count(*) from public.post_items as p
          join public.content_batches as b on b.id = p.batch_id and b.user_id = p.user_id
          where p.state in ('queued_input', 'failed_generation')
            and p.wp_post_id is null
            and jsonb_typeof(p.source_payload) = 'object'
            and not (p.source_payload ? 'requested_category_names')
            and jsonb_typeof(p.categories) = 'array'
            and jsonb_array_length(p.categories) = 1
            and jsonb_typeof(p.categories -> 0) = 'string'
            and btrim(p.categories ->> 0) <> ''
            and p.categories is distinct from coalesce(b.ai_config -> 'category_names', '[]'::jsonb)$q$),
      (503, 'Normalisasi wp_sites.max_concurrency > 10 → 10', 'INFO',
       'Dinormalkan migrasi 20261015110000 sebelum CHECK 1..10 dipasang. Tidak perlu tindakan.',
       $q$select count(*) from public.wp_sites where max_concurrency > 10$q$),
      (510, 'Tenant bersitus tanpa kunci OpenRouter tersimpan di server', 'INFO',
       'v2 BYOK-only dan tidak lagi memakai kunci dari localStorage browser: artikel tenant ini gagal "kunci '
       || 'OpenRouter belum dikonfigurasi" sampai kunci dimasukkan di Pengaturan → Kunci API & Model AI. Sertakan di pemberitahuan.',
       $q$select count(distinct s.user_id) from public.wp_sites as s
          where not exists (
            select 1 from public.user_settings as u
            where u.user_id = s.user_id and coalesce(u.encrypted_openrouter_key, '') <> ''
          )$q$)
  ) as v (urut, nama, status, tindakan, sql)
  cross join lateral pg_temp.pf_cek(v.urut, v.nama, v.status, v.tindakan, v.sql) as c;

  -- 3.9 Realtime ------------------------------------------------------------------------------------------
  urut := 600;
  pemeriksaan := 'Publication supabase_realtime';
  jumlah := null;
  select p.puballtables into pub_semua from pg_publication as p where p.pubname = 'supabase_realtime';
  if not found then
    status := 'INFO';
    tindakan := 'Publication tidak ada (bukan Supabase / Realtime nonaktif); bagian publication migrasi realtime dilewati.';
  elsif pub_semua then
    status := 'PERINGATAN';
    tindakan := 'Publication FOR ALL TABLES: semua tabel (termasuk user_settings/wp_sites bersecret) ikut Postgres '
      || 'Changes dan migrasi tidak dapat mengeluarkan post_items/execution_logs. Ubah ke daftar tabel eksplisit.';
  else
    status := 'OK';
    tindakan := '-';
  end if;
  return next;

  select array_agg(pt.tablename::text order by pt.tablename) into daftar
  from pg_publication_tables as pt
  where pt.pubname = 'supabase_realtime'
    and pt.schemaname = 'public'
    and pt.tablename::text = any (tabel_app);
  urut := 601;
  pemeriksaan := 'Tabel aplikasi di publication supabase_realtime (Postgres Changes)';
  jumlah := coalesce(cardinality(daftar), 0);
  if daftar is null then
    status := 'OK';
    tindakan := '-';
  else
    status := 'PERINGATAN';
    tindakan := 'Terdaftar: ' || array_to_string(daftar, ', ') || '. Event DELETE Postgres Changes tidak melewati RLS. '
      || 'Migrasi 20261017100000 mengeluarkan post_items & execution_logs; tabel lain (atau bila masih muncul '
      || 'setelah migrasi) keluarkan manual: alter publication supabase_realtime drop table public.<tabel>;';
  end if;
  return next;

  realtime_ada := to_regprocedure('realtime.send(jsonb, text, text, boolean)') is not null
    and to_regprocedure('realtime.topic()') is not null
    and to_regclass('realtime.messages') is not null;
  urut := 602;
  pemeriksaan := 'Skema Realtime Supabase (realtime.send, realtime.topic, realtime.messages)';
  jumlah := null;
  if realtime_ada then
    status := 'OK';
    tindakan := '-';
  else
    status := 'PERINGATAN';
    tindakan := 'Tidak tersedia: trigger Broadcast & policy topik privat dilewati migrasi; dasbor v2 tetap jalan '
      || 'dengan polling cadangan (tanpa update live). Wajar hanya di Postgres non-Supabase.';
  end if;
  return next;

  urut := 603;
  pemeriksaan := 'Broadcast privat v2 (4 trigger broadcast_* + policy panitera_receive_own_user_topics)';
  if not realtime_ada then
    status := 'INFO';
    jumlah := null;
    tindakan := 'Tidak berlaku (skema Realtime tidak ada).';
  else
    select count(*)::integer into ada
    from pg_trigger as t
    join pg_class as c on c.oid = t.tgrelid
    where c.relnamespace = 'public'::regnamespace
      and not t.tgisinternal
      and t.tgname in ('broadcast_post_item_update', 'broadcast_post_items_inserted',
                       'broadcast_post_items_deleted', 'broadcast_execution_log');
    ada := ada + (
      select count(*)::integer from pg_policies as p
      where p.schemaname = 'realtime' and p.tablename = 'messages' and p.policyname = 'panitera_receive_own_user_topics'
    );
    jumlah := ada;
    if ada = 5 then
      status := 'OK';
      tindakan := 'Terpasang. Pastikan "Allow public access" Realtime dimatikan (Dashboard → Realtime → Settings).';
    elsif ada = 0 then
      status := 'INFO';
      tindakan := 'Belum ada; dibuat migrasi 20261017100000.';
    else
      status := 'PERINGATAN';
      tindakan := 'Terpasang sebagian (' || ada || '/5). Jalankan ulang isi migrasi 20261017100000 (idempoten) di SQL '
        || 'Editor; `db push` tidak mengulang migrasi yang sudah tercatat.';
    end if;
  end if;
  return next;

  daftar := null;
  if to_regclass('realtime.messages') is not null then
    select array_agg(
             p.policyname || ' (' || array_to_string(p.roles, ',') || '; using: ' || coalesce(p.qual, '-') || ')'
             order by p.policyname
           ) into daftar
    from pg_policies as p
    where p.schemaname = 'realtime'
      and p.tablename = 'messages'
      and p.policyname <> 'panitera_receive_own_user_topics'
      and p.permissive = 'PERMISSIVE'
      and p.cmd in ('SELECT', 'ALL');
  end if;
  urut := 604;
  pemeriksaan := 'Policy SELECT lain di realtime.messages';
  jumlah := coalesce(cardinality(daftar), 0);
  if daftar is null then
    status := 'OK';
    tindakan := '-';
  else
    status := 'PERINGATAN';
    tindakan := array_to_string(daftar, '; ') || '. Policy permissive digabung OR dengan policy topik privat Panitera: '
      || 'pastikan tidak ada yang mengizinkan topik user:<uid>:… milik orang lain (mis. using (true)).';
  end if;
  return next;

  -- 3.10 Drift katalog -------------------------------------------------------------------------------------
  -- Tipe kolom yang SUDAH ada (baseline hanya `add column if not exists`; tipe lama tidak diubah).
  ada := 0;
  for r in
    select e.tabel, e.kolom, e.tipe, e.fatal, format_type(a.atttypid, a.atttypmod) as aktual
    from pg_temp.pf_kolom_ekspektasi() as e
    join pg_class as c on c.relname = e.tabel and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    join pg_attribute as a on a.attrelid = c.oid and a.attname = e.kolom and a.attnum > 0 and not a.attisdropped
    where format_type(a.atttypid, a.atttypmod) <> e.tipe
    order by e.tabel, e.kolom
  loop
    ada := ada + 1;
    urut := 701;
    pemeriksaan := 'Drift tipe ' || r.tabel || '.' || r.kolom;
    status := case when r.fatal then 'GAGAL' else 'PERINGATAN' end;
    jumlah := null;
    tindakan := 'Production: ' || r.aktual || '; migrasi mengharapkan: ' || r.tipe || '. '
      || case
           when r.fatal then 'FK komposit/CHECK/RPC v2 akan gagal pada tipe ini. Ubah tipe kolom lewat migrasi '
             || 'tambahan yang disepakati (ALTER TABLE ... ALTER COLUMN ... TYPE ... USING ...) SEBELUM db push.'
           else 'Migrasi tidak mengubah tipe kolom yang sudah ada dan v2 tetap berjalan; selaraskan lewat migrasi '
             || 'lanjutan bila perlu (bandingkan dengan `supabase db diff --linked`).'
         end;
    return next;
  end loop;
  if ada = 0 then
    urut := 700;
    pemeriksaan := 'Drift tipe kolom (kolom yang sudah ada vs migrasi)';
    status := 'OK';
    jumlah := 0;
    tindakan := '-';
    return next;
  end if;

  select array_agg(t.nama order by t.nama) into daftar
  from unnest(tabel_app) as t (nama)
  where to_regclass('public.' || quote_ident(t.nama)) is null;
  urut := 702;
  pemeriksaan := 'Tabel aplikasi yang belum ada';
  jumlah := coalesce(cardinality(daftar), 0);
  status := case when daftar is null then 'OK' else 'INFO' end;
  tindakan := case when daftar is null then '-'
    else array_to_string(daftar, ', ') || ' — akan dibuat migrasi.' end;
  return next;

  select array_agg(e.tabel || '.' || e.kolom order by e.tabel, e.kolom) into daftar
  from pg_temp.pf_kolom_ekspektasi() as e
  where to_regclass('public.' || quote_ident(e.tabel)) is not null
    and not exists (
      select 1 from pg_attribute as a
      where a.attrelid = to_regclass('public.' || quote_ident(e.tabel))
        and a.attname = e.kolom and a.attnum > 0 and not a.attisdropped
    );
  urut := 703;
  pemeriksaan := 'Kolom yang belum ada di tabel yang sudah ada';
  jumlah := coalesce(cardinality(daftar), 0);
  status := case when daftar is null then 'OK' else 'INFO' end;
  tindakan := case when daftar is null then '-'
    else array_to_string(daftar, ', ') || ' — akan ditambah migrasi (add column if not exists).' end;
  return next;

  select
    array_agg(c.relname || '.' || a.attname order by c.relname, a.attnum),
    array_agg(c.relname || '.' || a.attname order by c.relname, a.attnum)
      filter (where a.attnotnull and not a.atthasdef and a.attidentity = '' and a.attgenerated = '')
  into daftar, daftar_wajib
  from pg_class as c
  join pg_attribute as a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where c.relnamespace = 'public'::regnamespace
    and c.relkind = 'r'
    and c.relname::text = any (tabel_app)
    and not exists (
      select 1 from pg_temp.pf_kolom_ekspektasi() as e where e.tabel = c.relname::text and e.kolom = a.attname::text
    );
  urut := 704;
  pemeriksaan := 'Kolom ekstra di production (tidak dikenal migrasi)';
  jumlah := coalesce(cardinality(daftar), 0);
  status := case when daftar is null then 'OK' else 'INFO' end;
  tindakan := case when daftar is null then '-'
    else array_to_string(daftar, ', ') || ' — tidak disentuh migrasi dan tidak dibaca v2 (mis. kunci BYOK lama '
      || 'pexels/unsplash). Hapus terpisah setelah backup bila yakin tidak dipakai.' end;
  return next;

  urut := 705;
  pemeriksaan := 'Kolom ekstra NOT NULL tanpa default';
  jumlah := coalesce(cardinality(daftar_wajib), 0);
  status := case when daftar_wajib is null then 'OK' else 'GAGAL' end;
  tindakan := case when daftar_wajib is null then '-'
    else array_to_string(daftar_wajib, ', ') || ' — INSERT dari v2 tidak mengisi kolom ini sehingga akan ditolak. '
      || 'Beri DEFAULT atau jadikan nullable (migrasi tambahan yang disepakati) sebelum deploy.' end;
  return next;

  -- Nullability: kolom NOT NULL di migrasi tetapi nullable di production. user_id pada uploaded_media,
  -- user_settings, webhooks dikecualikan karena ditegakkan baseline (lihat 300–303).
  daftar := array[]::text[];
  daftar_wajib := array[]::text[];
  total := 0;
  for r in
    select e.tabel, e.kolom
    from pg_temp.pf_kolom_ekspektasi() as e
    join pg_class as c on c.relname = e.tabel and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    join pg_attribute as a on a.attrelid = c.oid and a.attname = e.kolom and a.attnum > 0 and not a.attisdropped
    where e.wajib_isi
      and not a.attnotnull
      and (e.tabel, e.kolom) not in (('uploaded_media', 'user_id'), ('user_settings', 'user_id'), ('webhooks', 'user_id'))
    order by e.tabel, e.kolom
  loop
    select h.n, h.galat into hasil
    from pg_temp.pf_hitung(format('select count(*) from public.%I where %I is null', r.tabel, r.kolom)) as h;
    if coalesce(hasil.n, 0) > 0 then
      total := total + hasil.n;
      daftar_wajib := daftar_wajib || (r.tabel || '.' || r.kolom || ' (' || hasil.n || ' NULL)');
    else
      daftar := daftar || (r.tabel || '.' || r.kolom);
    end if;
  end loop;
  urut := 706;
  pemeriksaan := 'Nullability: kolom NOT NULL di migrasi tetapi nullable di production';
  jumlah := cardinality(daftar) + cardinality(daftar_wajib);
  if jumlah = 0 then
    status := 'OK';
    tindakan := '-';
  elsif cardinality(daftar_wajib) > 0 then
    status := 'PERINGATAN';
    tindakan := 'Berisi NULL: ' || array_to_string(daftar_wajib, ', ')
      || '. Baseline tidak mengubah nullability kolom lama; isi nilai default untuk baris NULL, lalu tegakkan NOT NULL '
      || 'lewat migrasi lanjutan yang disepakati.'
      || case when cardinality(daftar) > 0
           then ' Kolom lain tanpa NULL: ' || array_to_string(daftar, ', ') || '.' else '' end;
  else
    status := 'INFO';
    tindakan := array_to_string(daftar, ', ') || ' — tanpa nilai NULL; aman untuk v2. Selaraskan lewat migrasi '
      || 'lanjutan bila perlu (`supabase db diff --linked`).';
  end if;
  return next;

  -- CHECK yang tidak dikenal migrasi tetap ada setelah db push dan dapat menolak penulisan v2.
  -- execution_logs_step_check dikecualikan: dihapus eksplisit oleh baseline.
  select array_agg(c.relname || '.' || k.conname || ': ' || pg_get_constraintdef(k.oid) order by c.relname, k.conname)
  into daftar
  from pg_constraint as k
  join pg_class as c on c.oid = k.conrelid
  where c.relnamespace = 'public'::regnamespace
    and c.relname::text = any (tabel_app)
    and k.contype = 'c'
    and k.conname <> 'execution_logs_step_check'
    and not exists (
      select 1 from pg_temp.pf_check_ekspektasi() as e where e.tabel = c.relname::text and e.nama = k.conname::text
    );
  urut := 707;
  pemeriksaan := 'CHECK constraint yang tidak dikenal migrasi';
  jumlah := coalesce(cardinality(daftar), 0);
  status := case when daftar is null then 'OK' else 'PERINGATAN' end;
  tindakan := case when daftar is null then '-'
    else array_to_string(daftar, '; ') || ' — tidak dihapus migrasi; pastikan tidak menolak nilai yang ditulis v2 '
      || '(step log dinamis, 9 state, dst.) atau hapus lewat migrasi tambahan.' end;
  return next;

  select array_agg(c.relname || '.' || t.tgname order by c.relname, t.tgname) into daftar
  from pg_trigger as t
  join pg_class as c on c.oid = t.tgrelid
  where c.relnamespace = 'public'::regnamespace
    and c.relname::text = any (tabel_app)
    and not t.tgisinternal
    and t.tgname not in ('set_updated_at', 'broadcast_post_item_update', 'broadcast_post_items_inserted',
                         'broadcast_post_items_deleted', 'broadcast_execution_log');
  urut := 708;
  pemeriksaan := 'Trigger yang tidak dikenal migrasi';
  jumlah := coalesce(cardinality(daftar), 0);
  status := case when daftar is null then 'OK' else 'PERINGATAN' end;
  tindakan := case when daftar is null then '-'
    else array_to_string(daftar, ', ') || ' — tetap aktif setelah migrasi. Trigger updated_at lama duplikat '
      || 'set_updated_at; tinjau trigger lain (dapat mengubah/menolak penulisan worker) sebelum deploy.' end;
  return next;

  select
    array_agg(c.relname || case when c.relrowsecurity then '' else ' (RLS NONAKTIF)' end order by c.relname),
    count(*) filter (where not c.relrowsecurity)
  into daftar, total
  from pg_class as c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind in ('r', 'p')
    and c.relname::text <> all (tabel_app);
  urut := 709;
  pemeriksaan := 'Tabel lain di skema public (tidak disentuh migrasi)';
  jumlah := coalesce(cardinality(daftar), 0);
  if daftar is null then
    status := 'OK';
    tindakan := '-';
  elsif total > 0 then
    status := 'PERINGATAN';
    tindakan := array_to_string(daftar, ', ') || ' — tabel tanpa RLS di skema public dapat dibaca lewat Data API '
      || 'bila role anon/authenticated punya GRANT. Aktifkan RLS atau hapus (mis. prompt_templates lama, tidak dipakai v2).';
  else
    status := 'INFO';
    tindakan := array_to_string(daftar, ', ') || ' — tidak dipakai v2 (mis. prompt_templates lama). Hapus terpisah '
      || 'setelah backup bila yakin.';
  end if;
  return next;

  -- View tanpa security_invoker (dan materialized view) berjalan dengan hak pemiliknya → melewati RLS tabel dasar.
  daftar := null;
  daftar_wajib := null;
  if (select count(*) from pg_roles where rolname in ('anon', 'authenticated')) = 2 then
    select
      array_agg(c.relname || case when c.relkind = 'm' then ' (materialized)' else '' end order by c.relname),
      array_agg(c.relname::text order by c.relname) filter (
        where (c.relkind = 'm'
               or not coalesce(array_to_string(c.reloptions, ',') ~* 'security_invoker=(true|on|yes|1)', false))
          and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))
      )
    into daftar, daftar_wajib
    from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('v', 'm');
  end if;
  urut := 710;
  pemeriksaan := 'View di skema public';
  jumlah := coalesce(cardinality(daftar), 0);
  if daftar is null then
    status := 'OK';
    tindakan := '-';
  elsif daftar_wajib is not null then
    status := 'PERINGATAN';
    tindakan := 'Dapat dibaca anon/authenticated tanpa security_invoker (melewati RLS tabel dasar): '
      || array_to_string(daftar_wajib, ', ') || '. Set `alter view ... set (security_invoker = true)` atau cabut GRANT. '
      || 'View tidak ikut dump tabel aplikasi untuk rollback — sertakan dengan --table bila perlu.';
  else
    status := 'INFO';
    tindakan := array_to_string(daftar, ', ') || ' — tidak disentuh migrasi; view tidak ikut dump tabel aplikasi untuk '
      || 'rollback, sertakan dengan --table bila perlu.';
  end if;
  return next;
end;
$fn$;

select pemeriksaan, status, jumlah, tindakan
from pg_temp.panitera_preflight()
order by urut, pemeriksaan;
