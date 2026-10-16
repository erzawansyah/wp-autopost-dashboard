-- =============================================================================
-- Panitera · Baseline schema (Rombak v2 · Fase 1)
-- =============================================================================
-- Rekonstruksi skema `public` yang dipakai kode saat ini (`src/**`), menggantikan
-- skrip ad-hoc Management API di `.workspaces/scripts/` (migrate-*.js, sql/*.sql).
-- Sumber kolom: seluruh query `.from("<tabel>")` di src/ (select/insert/update/filter),
-- dilengkapi DDL lama dan ARCHITECTURE.md §3.
--
-- 10 tabel: wp_sites, content_batches, post_items, execution_logs, agent_profiles,
-- agent_runs, agent_skills, user_settings, webhooks, uploaded_media.
-- `prompt_templates` / `prompt_template_versions` (skrip lama) TIDAK dipakai kode → tidak dibuat.
--
-- Idempoten & konvergen (aman dijalankan ulang, juga ke DB production yang sudah ada):
--   * tabel `create table if not exists`; kolom yang dibutuhkan kode tetapi tidak dibuat
--     skrip lama ditambah via `add column if not exists`. Perbedaan tipe/default/nullability
--     kolom yang SUDAH ada di production tidak diubah otomatis → periksa via `supabase db diff`
--     (pengecualian yang diketahui dari pre-flight production: `webhooks.events` text[] → jsonb, dan
--     `user_settings.id` yang tidak ada ditambahkan);
--   * CHECK & FK di-`drop if exists` lalu dibuat ulang dengan nama tetap (menggantikan versi lama);
--   * UNIQUE hanya ditambah bila belum ada indeks unik pada kolom yang sama;
--   * SELURUH policy pada 10 tabel dihapus lalu dibuat ulang (policy lama yang bocor ikut hilang);
--   * hak akses (GRANT) dinyatakan eksplisit karena project baru tidak lagi auto-grant.
--
-- Wajib PostgreSQL >= 15 (`on delete set null (kolom)` pada FK komposit).
--
-- Pre-flight sebelum `supabase db push` ke production (semua harus 0 baris):
--   select user_id, base_url, count(*) from public.wp_sites group by 1, 2 having count(*) > 1;
--   select user_id, slug, count(*) from public.agent_skills where user_id is not null group by 1, 2 having count(*) > 1;
--   select slug, count(*) from public.agent_skills where is_system group by 1 having count(*) > 1;
--   select id from public.agent_skills where is_system = (user_id is not null);
--   select p.id from public.post_items p join public.wp_sites s on s.id = p.wp_site_id where s.user_id <> p.user_id;
--   select p.id from public.post_items p join public.content_batches b on b.id = p.batch_id where b.user_id <> p.user_id;
--   select b.id from public.content_batches b join public.wp_sites s on s.id = b.wp_site_id where s.user_id <> b.user_id;
--   select l.id from public.execution_logs l join public.post_items p on p.id = l.post_item_id where p.user_id <> l.user_id;
--   select r.id from public.agent_runs r join public.post_items p on p.id = r.post_item_id where p.user_id <> r.user_id;
--   select m.id from public.uploaded_media m join public.wp_sites s on s.id = m.site_id where m.user_id <> s.user_id;
--   select state, count(*) from public.post_items where state not in ('queued_input','generating_content',
--     'ready_to_sync','syncing_to_wp','published_on_wp','scheduled_on_wp','saved_draft_on_wp',
--     'failed_generation','failed_sync') group by 1;
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Trigger function: updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger BEFORE UPDATE: mengisi updated_at = now(). Heartbeat klaim worker bergantung pada kolom ini.';

-- Hanya dipanggil sebagai trigger; tidak boleh diekspos sebagai RPC Data API.
revoke all on function public.set_updated_at() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 1. Tabel
-- -----------------------------------------------------------------------------

-- 1.1 wp_sites — situs WordPress milik tenant (Application Password terenkripsi AES-256-GCM)
create table if not exists public.wp_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  site_name text not null,
  base_url text not null,
  wp_username text not null,
  encrypted_app_password text not null,
  status text not null default 'connected',
  default_author_id integer,
  default_category_id integer,
  max_concurrency integer not null default 2,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1.2 content_batches — kampanye bulk (Immediate Batch / Scheduled Drip)
create table if not exists public.content_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  wp_site_id uuid,
  name text not null,
  source_type text not null default 'manual',
  execution_mode text not null default 'immediate',
  ai_config jsonb not null default '{}'::jsonb,
  schedule_config jsonb not null default '{}'::jsonb,
  custom_instructions_override text,
  status text not null default 'draft',
  total_items integer not null default 0,
  completed_items integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1.3 post_items — Database-First State Machine (9 state, PRD §4)
--   source_payload: agentProfileRef, engine, aiModel, reasoningEffort, style, language,
--   category_ids, category_names, batch_name, schedule_mode, execution_mode, slot_index,
--   lsi, customTitle, focus, wp_publish_meta {categoryIds, tagIds, authorId, featuredMediaId}.
create table if not exists public.post_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid,
  user_id uuid not null,
  wp_site_id uuid not null,
  target_keyword text not null,
  source_payload jsonb not null default '{}'::jsonb,
  title text,
  slug text,
  content_html text,
  excerpt text,
  featured_image_url text,
  categories jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  custom_instructions_override text,
  state text not null default 'queued_input',
  scheduled_for timestamptz,
  wp_post_id bigint,
  wp_post_url text,
  wp_target_status text not null default 'draft',
  retry_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1.4 execution_logs — telemetri per item (append-only). `step` sengaja teks bebas:
--   node LangGraph/agen menulis nilai dinamis (event.kind, wordpress_publisher, stale_recovery, ...).
create table if not exists public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  post_item_id uuid,
  user_id uuid not null,
  step text not null,
  level text not null default 'info',
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 1.5 agent_profiles — Agent Profile kustom tenant. `limits.isDefault` menandai profil default.
create table if not exists public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  description text,
  mode text not null,
  model text,
  temperature numeric(3, 2) not null default 0.35,
  workflow_prompt text not null,
  tool_ids text[] not null default '{}',
  skills text[] not null default '{}',
  limits jsonb not null default '{}'::jsonb,
  based_on_preset text,
  version integer not null default 1,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1.6 agent_runs — metrik eksekusi agen per item (ditulis worker / service_role).
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  post_item_id uuid,
  user_id uuid not null,
  profile_ref text not null,
  profile_snapshot jsonb not null default '{}'::jsonb,
  status text not null,
  stop_reason text,
  model_calls integer not null default 0,
  tool_calls integer not null default 0,
  tokens_prompt integer,
  tokens_completion integer,
  duration_ms integer,
  word_count integer,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- 1.7 agent_skills — modul SKILL.md. Skill sistem: is_system = true & user_id null.
create table if not exists public.agent_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  slug text not null,
  description text,
  content text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1.8 user_settings — satu baris per tenant: kunci BYOK terenkripsi + preferensi.
--   search_preferences: { default_provider, default_ai_model?, reasoning_effort? }
--   notification_prefs: { email_on_failure?, email_on_batch_complete?, notify_on_queue_empty?,
--     in_app_toast?, developer_mode?, langsmith_api_key? (terenkripsi), langsmith_project? }
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  encrypted_openrouter_key text,
  encrypted_tavily_key text,
  encrypted_brave_key text,
  encrypted_serpapi_key text,
  encrypted_pexafy_key text,
  searxng_url text,
  search_preferences jsonb not null default '{"default_provider": "auto"}'::jsonb,
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1.9 webhooks — outbound webhook (secret HMAC terenkripsi), events = array WebhookEvent.
create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  url text not null,
  encrypted_secret text not null,
  events jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1.10 uploaded_media — cache deduplikasi unggahan media WordPress per situs.
create table if not exists public.uploaded_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  site_id uuid not null,
  post_id uuid,
  source_url text not null,
  site_url text not null,
  image_id bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 2. Konvergensi kolom untuk DB yang dibuat skrip ad-hoc lama
-- -----------------------------------------------------------------------------
-- Kolom yang dibaca/ditulis kode tetapi tidak ada di DDL lama (atau DDL-nya tidak diketahui).
alter table public.agent_profiles add column if not exists skills text[] not null default '{}';

alter table public.agent_runs
  add column if not exists tokens_prompt integer,
  add column if not exists tokens_completion integer;

alter table public.user_settings
  add column if not exists encrypted_openrouter_key text,
  add column if not exists encrypted_tavily_key text,
  add column if not exists encrypted_brave_key text,
  add column if not exists encrypted_serpapi_key text,
  add column if not exists encrypted_pexafy_key text,
  add column if not exists searxng_url text,
  add column if not exists search_preferences jsonb not null default '{"default_provider": "auto"}'::jsonb,
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.webhooks
  add column if not exists events jsonb not null default '[]'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Production lama membuat `webhooks.events` bertipe text[] (bukan jsonb); kode v2 & CHECK `webhooks_events_check`
-- memerlukan array JSON. Dikonversi tanpa kehilangan isi (to_jsonb(text[]) → array string; NULL → '[]').
-- Indeks lama pada kolom ini (operator class array tidak berlaku untuk jsonb) dibuang lebih dulu; v2 tidak
-- mengindeks `events`. Tidak berpengaruh pada instalasi baru / DB yang kolomnya sudah jsonb.
do $$
declare
  legacy_index text;
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.webhooks'::regclass
      and attname = 'events'
      and not attisdropped
      and format_type(atttypid, atttypmod) = 'text[]'
  ) then
    for legacy_index in
      select i.indexrelid::regclass::text
      from pg_index as i
      join pg_attribute as a on a.attrelid = i.indrelid and a.attnum = any (i.indkey::int2[])
      where i.indrelid = 'public.webhooks'::regclass
        and a.attname = 'events'
        and not i.indisprimary
    loop
      execute format('drop index if exists %s', legacy_index);
    end loop;
    alter table public.webhooks alter column events drop default;
    alter table public.webhooks
      alter column events type jsonb using coalesce(to_jsonb(events), '[]'::jsonb);
    alter table public.webhooks alter column events set default '[]'::jsonb;
    alter table public.webhooks alter column events set not null;
  end if;
end;
$$;

-- Production lama tidak punya `user_settings.id` (identitas baris lewat `user_id`). Ditambah agar skema sama
-- dengan instalasi baru; baris lama mendapat uuid baru, keunikannya dijaga constraint di §3.
alter table public.user_settings add column if not exists id uuid not null default gen_random_uuid();

-- Isolasi tenant: user_id wajib terisi. Skrip lama `sql/uploaded_media.sql` membuat kolom ini
-- nullable (dan policy `user_id IS NULL` yang bocor lintas tenant). Baris lama tanpa pemilik
-- diisi dari pemilik situsnya (deterministik), lalu NOT NULL ditegakkan.
update public.uploaded_media as m
set user_id = s.user_id
from public.wp_sites as s
where m.site_id = s.id
  and m.user_id is null;

alter table public.uploaded_media alter column user_id set not null;
alter table public.user_settings alter column user_id set not null;
alter table public.webhooks alter column user_id set not null;


-- -----------------------------------------------------------------------------
-- 3. UNIQUE (prasyarat FK komposit anti lintas-tenant & target upsert)
-- -----------------------------------------------------------------------------
-- Ditambah hanya bila belum ada indeks unik non-parsial pada kolom yang sama (nama apa pun),
-- sehingga constraint yang dibuat manual di production tidak terduplikasi.
do $$
declare
  spec record;
begin
  for spec in
    select *
    from (
      values
        ('public.wp_sites'::regclass, 'wp_sites_id_user_id_key', array['id', 'user_id']),
        ('public.wp_sites'::regclass, 'wp_sites_user_id_base_url_key', array['user_id', 'base_url']),
        ('public.content_batches'::regclass, 'content_batches_id_user_id_key', array['id', 'user_id']),
        ('public.post_items'::regclass, 'post_items_id_user_id_key', array['id', 'user_id']),
        ('public.agent_skills'::regclass, 'agent_skills_user_id_slug_key', array['user_id', 'slug']),
        ('public.user_settings'::regclass, 'user_settings_user_id_key', array['user_id']),
        ('public.user_settings'::regclass, 'user_settings_id_key', array['id'])
    ) as s (tbl, conname, cols)
  loop
    if not exists (
      select 1
      from pg_index as i
      where i.indrelid = spec.tbl
        and i.indisunique
        and i.indpred is null
        and i.indexprs is null
        and (
          select array_agg(a.attname::text order by k.ord)
          from unnest(i.indkey::int2[]) with ordinality as k (attnum, ord)
          join pg_attribute as a on a.attrelid = i.indrelid and a.attnum = k.attnum
        ) = spec.cols
    ) then
      execute format(
        'alter table %s add constraint %I unique (%s)',
        spec.tbl,
        spec.conname,
        (select string_agg(quote_ident(c), ', ') from unnest(spec.cols) as c)
      );
    end if;
  end loop;
end;
$$;

-- Skill sistem unik di antara baris sistem (skill tenant unik per user_id via constraint di atas).
create unique index if not exists agent_skills_system_slug_key
  on public.agent_skills (slug)
  where is_system;


-- -----------------------------------------------------------------------------
-- 4. CHECK constraints (nilai literal diverifikasi terhadap kode)
-- -----------------------------------------------------------------------------
-- wp_sites
alter table public.wp_sites drop constraint if exists wp_sites_status_check;
alter table public.wp_sites add constraint wp_sites_status_check
  check (status in ('connected', 'auth_error', 'rate_limited', 'unreachable'));
alter table public.wp_sites drop constraint if exists wp_sites_max_concurrency_check;
alter table public.wp_sites add constraint wp_sites_max_concurrency_check
  check (max_concurrency >= 1);

-- content_batches (kode menulis source_type 'manual', execution_mode immediate|scheduled_drip,
-- status running|completed; nilai lain dipertahankan dari DDL lama untuk modul berikutnya)
alter table public.content_batches drop constraint if exists content_batches_source_type_check;
alter table public.content_batches add constraint content_batches_source_type_check
  check (source_type in ('csv_keywords', 'niche_auto', 'external_url', 'manual'));
alter table public.content_batches drop constraint if exists content_batches_execution_mode_check;
alter table public.content_batches add constraint content_batches_execution_mode_check
  check (execution_mode in ('immediate', 'scheduled_drip', 'wp_future'));
alter table public.content_batches drop constraint if exists content_batches_status_check;
alter table public.content_batches add constraint content_batches_status_check
  check (status in ('draft', 'running', 'paused', 'completed', 'failed'));
alter table public.content_batches drop constraint if exists content_batches_counters_check;
alter table public.content_batches add constraint content_batches_counters_check
  check (total_items >= 0 and completed_items >= 0);
alter table public.content_batches drop constraint if exists content_batches_ai_config_check;
alter table public.content_batches add constraint content_batches_ai_config_check
  check (jsonb_typeof(ai_config) = 'object');
alter table public.content_batches drop constraint if exists content_batches_schedule_config_check;
alter table public.content_batches add constraint content_batches_schedule_config_check
  check (jsonb_typeof(schedule_config) = 'object');

-- post_items: 9 state PRD §4 (jangan menambah state tanpa memperbarui PRD/ARCHITECTURE)
alter table public.post_items drop constraint if exists post_items_state_check;
alter table public.post_items add constraint post_items_state_check
  check (state in (
    'queued_input',
    'generating_content',
    'ready_to_sync',
    'syncing_to_wp',
    'published_on_wp',
    'scheduled_on_wp',
    'saved_draft_on_wp',
    'failed_generation',
    'failed_sync'
  ));
alter table public.post_items drop constraint if exists post_items_wp_target_status_check;
alter table public.post_items add constraint post_items_wp_target_status_check
  check (wp_target_status in ('publish', 'future', 'draft'));
alter table public.post_items drop constraint if exists post_items_retry_count_check;
alter table public.post_items add constraint post_items_retry_count_check
  check (retry_count >= 0);
alter table public.post_items drop constraint if exists post_items_source_payload_check;
alter table public.post_items add constraint post_items_source_payload_check
  check (jsonb_typeof(source_payload) = 'object');
alter table public.post_items drop constraint if exists post_items_categories_check;
alter table public.post_items add constraint post_items_categories_check
  check (jsonb_typeof(categories) = 'array');
alter table public.post_items drop constraint if exists post_items_tags_check;
alter table public.post_items add constraint post_items_tags_check
  check (jsonb_typeof(tags) = 'array');

-- execution_logs: level dibatasi; step bebas (CHECK lama execution_logs_step_check bentrok
-- dengan nama step dinamis dan sudah dihapus di production — jangan dihidupkan lagi).
alter table public.execution_logs drop constraint if exists execution_logs_step_check;
alter table public.execution_logs drop constraint if exists execution_logs_level_check;
alter table public.execution_logs add constraint execution_logs_level_check
  check (level in ('info', 'warn', 'error'));
alter table public.execution_logs drop constraint if exists execution_logs_details_check;
alter table public.execution_logs add constraint execution_logs_details_check
  check (jsonb_typeof(details) = 'object');

-- agent_profiles
alter table public.agent_profiles drop constraint if exists agent_profiles_name_check;
alter table public.agent_profiles add constraint agent_profiles_name_check
  check (char_length(name) between 2 and 100);
alter table public.agent_profiles drop constraint if exists agent_profiles_mode_check;
alter table public.agent_profiles add constraint agent_profiles_mode_check
  check (mode in ('standard', 'deep'));
alter table public.agent_profiles drop constraint if exists agent_profiles_workflow_prompt_check;
alter table public.agent_profiles add constraint agent_profiles_workflow_prompt_check
  check (char_length(workflow_prompt) <= 12000);
alter table public.agent_profiles drop constraint if exists agent_profiles_limits_check;
alter table public.agent_profiles add constraint agent_profiles_limits_check
  check (jsonb_typeof(limits) = 'object');

-- agent_runs
alter table public.agent_runs drop constraint if exists agent_runs_status_check;
alter table public.agent_runs add constraint agent_runs_status_check
  check (status in ('running', 'completed', 'failed'));
alter table public.agent_runs drop constraint if exists agent_runs_profile_snapshot_check;
alter table public.agent_runs add constraint agent_runs_profile_snapshot_check
  check (jsonb_typeof(profile_snapshot) = 'object');

-- agent_skills
alter table public.agent_skills drop constraint if exists agent_skills_name_check;
alter table public.agent_skills add constraint agent_skills_name_check
  check (char_length(name) between 2 and 120);
alter table public.agent_skills drop constraint if exists agent_skills_slug_check;
alter table public.agent_skills add constraint agent_skills_slug_check
  check (slug ~ '^[a-z0-9_-]+$');
alter table public.agent_skills drop constraint if exists agent_skills_owner_check;
alter table public.agent_skills add constraint agent_skills_owner_check
  check ((is_system and user_id is null) or (not is_system and user_id is not null));

-- user_settings
alter table public.user_settings drop constraint if exists user_settings_search_preferences_check;
alter table public.user_settings add constraint user_settings_search_preferences_check
  check (jsonb_typeof(search_preferences) = 'object');
alter table public.user_settings drop constraint if exists user_settings_notification_prefs_check;
alter table public.user_settings add constraint user_settings_notification_prefs_check
  check (jsonb_typeof(notification_prefs) = 'object');

-- webhooks
alter table public.webhooks drop constraint if exists webhooks_events_check;
alter table public.webhooks add constraint webhooks_events_check
  check (jsonb_typeof(events) = 'array');

-- uploaded_media
alter table public.uploaded_media drop constraint if exists uploaded_media_metadata_check;
alter table public.uploaded_media add constraint uploaded_media_metadata_check
  check (jsonb_typeof(metadata) = 'object');


-- -----------------------------------------------------------------------------
-- 5. Foreign keys
-- -----------------------------------------------------------------------------
-- 5.1 Pemilik → auth.users (hapus akun = hapus seluruh data tenant)
alter table public.wp_sites drop constraint if exists wp_sites_user_id_fkey;
alter table public.wp_sites add constraint wp_sites_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.content_batches drop constraint if exists content_batches_user_id_fkey;
alter table public.content_batches add constraint content_batches_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.post_items drop constraint if exists post_items_user_id_fkey;
alter table public.post_items add constraint post_items_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.execution_logs drop constraint if exists execution_logs_user_id_fkey;
alter table public.execution_logs add constraint execution_logs_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.agent_profiles drop constraint if exists agent_profiles_user_id_fkey;
alter table public.agent_profiles add constraint agent_profiles_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.agent_runs drop constraint if exists agent_runs_user_id_fkey;
alter table public.agent_runs add constraint agent_runs_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.agent_skills drop constraint if exists agent_skills_user_id_fkey;
alter table public.agent_skills add constraint agent_skills_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.user_settings drop constraint if exists user_settings_user_id_fkey;
alter table public.user_settings add constraint user_settings_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.webhooks drop constraint if exists webhooks_user_id_fkey;
alter table public.webhooks add constraint webhooks_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
alter table public.uploaded_media drop constraint if exists uploaded_media_user_id_fkey;
alter table public.uploaded_media add constraint uploaded_media_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- 5.2 FK komposit (child, user_id) → parent (id, user_id): baris anak hanya boleh merujuk
--     baris induk milik tenant yang SAMA, termasuk untuk penulisan via service_role (worker).
--     Menggantikan FK satu kolom lama dengan nama yang sama.
alter table public.content_batches drop constraint if exists content_batches_wp_site_id_fkey;
alter table public.content_batches add constraint content_batches_wp_site_id_fkey
  foreign key (wp_site_id, user_id) references public.wp_sites (id, user_id) on delete cascade;

alter table public.post_items drop constraint if exists post_items_wp_site_id_fkey;
alter table public.post_items add constraint post_items_wp_site_id_fkey
  foreign key (wp_site_id, user_id) references public.wp_sites (id, user_id) on delete cascade;
alter table public.post_items drop constraint if exists post_items_batch_id_fkey;
alter table public.post_items add constraint post_items_batch_id_fkey
  foreign key (batch_id, user_id) references public.content_batches (id, user_id)
  on delete set null (batch_id);

alter table public.execution_logs drop constraint if exists execution_logs_post_item_id_fkey;
alter table public.execution_logs add constraint execution_logs_post_item_id_fkey
  foreign key (post_item_id, user_id) references public.post_items (id, user_id) on delete cascade;

alter table public.agent_runs drop constraint if exists agent_runs_post_item_id_fkey;
alter table public.agent_runs add constraint agent_runs_post_item_id_fkey
  foreign key (post_item_id, user_id) references public.post_items (id, user_id) on delete cascade;

alter table public.uploaded_media drop constraint if exists uploaded_media_site_id_fkey;
alter table public.uploaded_media add constraint uploaded_media_site_id_fkey
  foreign key (site_id, user_id) references public.wp_sites (id, user_id) on delete cascade;
alter table public.uploaded_media drop constraint if exists uploaded_media_post_id_fkey;
alter table public.uploaded_media add constraint uploaded_media_post_id_fkey
  foreign key (post_id, user_id) references public.post_items (id, user_id)
  on delete set null (post_id);


-- -----------------------------------------------------------------------------
-- 6. Indeks (query nyata di src/ + FK)
-- -----------------------------------------------------------------------------
-- Indeks lama dari skrip ad-hoc yang digantikan indeks di bawah (nama konsisten `<tabel>_<kolom>_idx`).
drop index if exists public.idx_wp_sites_user_id;
drop index if exists public.idx_content_batches_user_id;
drop index if exists public.idx_content_batches_wp_site_id;
drop index if exists public.idx_post_items_user_id;
drop index if exists public.idx_post_items_wp_site_id;
drop index if exists public.idx_post_items_batch_id;
drop index if exists public.idx_post_items_state;
drop index if exists public.idx_execution_logs_post_item_id;
drop index if exists public.idx_execution_logs_user_id;
drop index if exists public.agent_profiles_user_idx;
drop index if exists public.agent_runs_post_idx;
drop index if exists public.agent_runs_user_idx;
drop index if exists public.idx_agent_skills_user_id;
drop index if exists public.idx_agent_skills_slug;
drop index if exists public.idx_agent_skills_system;
drop index if exists public.idx_uploaded_media_site_source;
drop index if exists public.idx_uploaded_media_user;
drop index if exists public.idx_uploaded_media_post;

-- wp_sites: user_id tercakup oleh UNIQUE (user_id, base_url).

-- content_batches: daftar batch per tenant (order created_at desc) + FK situs.
create index if not exists content_batches_user_id_created_at_idx
  on public.content_batches (user_id, created_at desc);
create index if not exists content_batches_wp_site_id_idx
  on public.content_batches (wp_site_id);

-- post_items
create index if not exists post_items_user_id_created_at_idx
  on public.post_items (user_id, created_at desc);
create index if not exists post_items_wp_site_id_idx
  on public.post_items (wp_site_id);
-- FK batch + hitung progres batch per state (refreshBatchProgress).
create index if not exists post_items_batch_id_state_idx
  on public.post_items (batch_id, state);
-- Klaim worker: kandidat `state = 'queued_input'` + jadwal tayang (drip) / urutan masuk.
create index if not exists post_items_state_scheduled_for_idx
  on public.post_items (state, scheduled_for);
create index if not exists post_items_state_created_at_idx
  on public.post_items (state, created_at);
-- Auto-healing item macet: hanya baris in-flight (indeks parsial kecil).
create index if not exists post_items_in_flight_updated_at_idx
  on public.post_items (updated_at)
  where state in ('generating_content', 'syncing_to_wp');

-- execution_logs: log per item (order created_at asc) + FK pemilik.
create index if not exists execution_logs_post_item_id_created_at_idx
  on public.execution_logs (post_item_id, created_at);
create index if not exists execution_logs_user_id_idx
  on public.execution_logs (user_id);

-- agent_profiles: daftar profil per tenant (order created_at desc; filter is_archived).
create index if not exists agent_profiles_user_id_created_at_idx
  on public.agent_profiles (user_id, created_at desc);

-- agent_runs: run terbaru per item & per tenant.
create index if not exists agent_runs_post_item_id_created_at_idx
  on public.agent_runs (post_item_id, created_at desc);
create index if not exists agent_runs_user_id_created_at_idx
  on public.agent_runs (user_id, created_at desc);

-- agent_skills: user_id tercakup oleh UNIQUE (user_id, slug); slug sistem oleh indeks unik parsial.

-- webhooks: daftar per tenant + dispatcher (user_id, is_active).
create index if not exists webhooks_user_id_created_at_idx
  on public.webhooks (user_id, created_at desc);

-- uploaded_media: lookup deduplikasi (site_id, source_url) + FK.
create index if not exists uploaded_media_site_id_source_url_idx
  on public.uploaded_media (site_id, source_url);
create index if not exists uploaded_media_user_id_idx
  on public.uploaded_media (user_id);
create index if not exists uploaded_media_post_id_idx
  on public.uploaded_media (post_id);


-- -----------------------------------------------------------------------------
-- 7. Trigger updated_at
-- -----------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.wp_sites;
create trigger set_updated_at before update on public.wp_sites
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.content_batches;
create trigger set_updated_at before update on public.content_batches
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.post_items;
create trigger set_updated_at before update on public.post_items
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.agent_profiles;
create trigger set_updated_at before update on public.agent_profiles
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.agent_skills;
create trigger set_updated_at before update on public.agent_skills
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.user_settings;
create trigger set_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.webhooks;
create trigger set_updated_at before update on public.webhooks
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.uploaded_media;
create trigger set_updated_at before update on public.uploaded_media
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 8. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.wp_sites enable row level security;
alter table public.wp_sites force row level security;
alter table public.content_batches enable row level security;
alter table public.content_batches force row level security;
alter table public.post_items enable row level security;
alter table public.post_items force row level security;
alter table public.execution_logs enable row level security;
alter table public.execution_logs force row level security;
alter table public.agent_profiles enable row level security;
alter table public.agent_profiles force row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_runs force row level security;
alter table public.agent_skills enable row level security;
alter table public.agent_skills force row level security;
alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;
alter table public.webhooks enable row level security;
alter table public.webhooks force row level security;
alter table public.uploaded_media enable row level security;
alter table public.uploaded_media force row level security;

-- Hapus SEMUA policy lama (nama apa pun, termasuk policy `user_id IS NULL` di uploaded_media)
-- agar hasil akhirnya persis set policy di bawah.
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'wp_sites', 'content_batches', 'post_items', 'execution_logs', 'agent_profiles',
        'agent_runs', 'agent_skills', 'user_settings', 'webhooks', 'uploaded_media'
      )
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end;
$$;

-- 8.1 Tabel konfigurasi milik tenant: CRUD atas baris sendiri.
create policy wp_sites_select_own on public.wp_sites
  for select to authenticated using ((select auth.uid()) = user_id);
create policy wp_sites_insert_own on public.wp_sites
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy wp_sites_update_own on public.wp_sites
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy wp_sites_delete_own on public.wp_sites
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy content_batches_select_own on public.content_batches
  for select to authenticated using ((select auth.uid()) = user_id);
create policy content_batches_insert_own on public.content_batches
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy content_batches_update_own on public.content_batches
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy content_batches_delete_own on public.content_batches
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy agent_profiles_select_own on public.agent_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy agent_profiles_insert_own on public.agent_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy agent_profiles_update_own on public.agent_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy agent_profiles_delete_own on public.agent_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_settings_select_own on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_settings_insert_own on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_settings_delete_own on public.user_settings
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy webhooks_select_own on public.webhooks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy webhooks_insert_own on public.webhooks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy webhooks_update_own on public.webhooks
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy webhooks_delete_own on public.webhooks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 8.2 agent_skills: skill sistem terbaca semua pengguna login; tulis hanya skill non-sistem sendiri.
create policy agent_skills_select_system_or_own on public.agent_skills
  for select to authenticated using (is_system or (select auth.uid()) = user_id);
create policy agent_skills_insert_own on public.agent_skills
  for insert to authenticated
  with check ((select auth.uid()) = user_id and not is_system);
create policy agent_skills_update_own on public.agent_skills
  for update to authenticated
  using ((select auth.uid()) = user_id and not is_system)
  with check ((select auth.uid()) = user_id and not is_system);
create policy agent_skills_delete_own on public.agent_skills
  for delete to authenticated
  using ((select auth.uid()) = user_id and not is_system);

-- 8.3 post_items: pengguna hanya MENGANTREKAN item baru (queued_input, tanpa naskah/wp_post_id),
--     membaca, dan menghapus miliknya. Transisi state, naskah, dan wp_post_id hanya oleh worker
--     (service_role) — tidak ada policy/hak UPDATE untuk authenticated.
create policy post_items_select_own on public.post_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy post_items_insert_own_queued on public.post_items
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and state = 'queued_input'
    and content_html is null
    and wp_post_id is null
    and wp_post_url is null
  );
create policy post_items_delete_own on public.post_items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 8.4 execution_logs: append-only (baca + tulis log milik sendiri; terhapus via cascade item).
create policy execution_logs_select_own on public.execution_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy execution_logs_insert_own on public.execution_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- 8.5 Tabel milik worker: pengguna hanya membaca barisnya sendiri; tulis via service_role.
create policy agent_runs_select_own on public.agent_runs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy uploaded_media_select_own on public.uploaded_media
  for select to authenticated using ((select auth.uid()) = user_id);


-- -----------------------------------------------------------------------------
-- 9. Hak akses Data API (eksplisit; anon tidak punya akses ke tabel mana pun)
-- -----------------------------------------------------------------------------
revoke all on table
  public.wp_sites, public.content_batches, public.post_items, public.execution_logs,
  public.agent_profiles, public.agent_runs, public.agent_skills, public.user_settings,
  public.webhooks, public.uploaded_media
from anon, authenticated;

grant select, insert, update, delete on table
  public.wp_sites, public.content_batches, public.agent_profiles, public.agent_skills,
  public.user_settings, public.webhooks
to authenticated;
grant select, insert, delete on table public.post_items to authenticated;
grant select, insert on table public.execution_logs to authenticated;
grant select on table public.agent_runs, public.uploaded_media to authenticated;

grant select, insert, update, delete on table
  public.wp_sites, public.content_batches, public.post_items, public.execution_logs,
  public.agent_profiles, public.agent_runs, public.agent_skills, public.user_settings,
  public.webhooks, public.uploaded_media
to service_role;
