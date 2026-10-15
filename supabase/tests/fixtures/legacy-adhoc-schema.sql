-- =============================================================================
-- TEST-ONLY fixture: skema "production lama" hasil skrip ad-hoc Management API
-- (.workspaces/scripts/migrate-db.js, migrate-agent-profiles.js, migrate-agent-skills.js,
-- sql/uploaded_media.sql, migrate-user-settings-*.js, fix-execution-logs-constraint.js).
-- Dipakai untuk membuktikan baseline dapat diterapkan di atas DB yang sudah ada tanpa
-- kehilangan data dan berakhir dengan constraint/indeks/policy yang sama dengan DB baru.
-- DDL `user_settings` & `webhooks` tidak pernah ada di repo; versi di sini adalah tebakan
-- minimal berdasarkan kode (kolom yang diketahui + kolom BYOK lama pexels/unsplash).
-- =============================================================================

create table public.wp_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  site_name text not null,
  base_url text not null,
  wp_username text not null,
  encrypted_app_password text not null,
  status text default 'connected' check (status in ('connected', 'auth_error', 'rate_limited', 'unreachable')),
  default_author_id int,
  default_category_id int,
  max_concurrency int default 2,
  last_checked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_wp_sites_user_id on public.wp_sites(user_id);
alter table public.wp_sites enable row level security;
create policy "Users can view their own sites" on public.wp_sites for select using (auth.uid() = user_id);
create policy "Users can insert their own sites" on public.wp_sites for insert with check (auth.uid() = user_id);
create policy "Users can update their own sites" on public.wp_sites for update using (auth.uid() = user_id);
create policy "Users can delete their own sites" on public.wp_sites for delete using (auth.uid() = user_id);

create table public.content_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  wp_site_id uuid references public.wp_sites(id) on delete cascade,
  name text not null,
  source_type text default 'manual' check (source_type in ('csv_keywords', 'niche_auto', 'external_url', 'manual')),
  execution_mode text default 'immediate' check (execution_mode in ('immediate', 'scheduled_drip', 'wp_future')),
  ai_config jsonb default '{}'::jsonb,
  schedule_config jsonb default '{}'::jsonb,
  custom_instructions_override text,
  status text default 'completed' check (status in ('draft', 'running', 'paused', 'completed', 'failed')),
  total_items int default 1,
  completed_items int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_content_batches_user_id on public.content_batches(user_id);
create index idx_content_batches_wp_site_id on public.content_batches(wp_site_id);
alter table public.content_batches enable row level security;
create policy "Users can view their own batches" on public.content_batches for select using (auth.uid() = user_id);
create policy "Users can insert their own batches" on public.content_batches for insert with check (auth.uid() = user_id);
create policy "Users can update their own batches" on public.content_batches for update using (auth.uid() = user_id);
create policy "Users can delete their own batches" on public.content_batches for delete using (auth.uid() = user_id);

create table public.post_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.content_batches(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade not null,
  wp_site_id uuid references public.wp_sites(id) on delete cascade not null,
  target_keyword text not null,
  source_payload jsonb default '{}'::jsonb,
  title text,
  slug text,
  content_html text,
  excerpt text,
  featured_image_url text,
  categories jsonb default '[]'::jsonb,
  tags jsonb default '[]'::jsonb,
  custom_instructions_override text,
  state text default 'queued_input' check (state in (
    'queued_input', 'generating_content', 'ready_to_sync', 'syncing_to_wp', 'published_on_wp',
    'scheduled_on_wp', 'saved_draft_on_wp', 'failed_generation', 'failed_sync'
  )),
  scheduled_for timestamptz,
  wp_post_id bigint,
  wp_post_url text,
  wp_target_status text default 'draft' check (wp_target_status in ('publish', 'future', 'draft')),
  retry_count int default 0,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_post_items_user_id on public.post_items(user_id);
create index idx_post_items_wp_site_id on public.post_items(wp_site_id);
create index idx_post_items_batch_id on public.post_items(batch_id);
create index idx_post_items_state on public.post_items(state);
alter table public.post_items enable row level security;
create policy "Users can view their own posts" on public.post_items for select using (auth.uid() = user_id);
create policy "Users can insert their own posts" on public.post_items for insert with check (auth.uid() = user_id);
create policy "Users can update their own posts" on public.post_items for update using (auth.uid() = user_id);
create policy "Users can delete their own posts" on public.post_items for delete using (auth.uid() = user_id);

create table public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  post_item_id uuid references public.post_items(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade not null,
  step text not null check (step in ('generation', 'media_upload', 'post_creation', 'status_sync')),
  level text default 'info' check (level in ('info', 'warn', 'error')),
  message text not null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index idx_execution_logs_post_item_id on public.execution_logs(post_item_id);
create index idx_execution_logs_user_id on public.execution_logs(user_id);
alter table public.execution_logs enable row level security;
create policy "Users can view their own logs" on public.execution_logs for select using (auth.uid() = user_id);
create policy "Users can insert their own logs" on public.execution_logs for insert with check (auth.uid() = user_id);
-- fix-execution-logs-constraint.js
alter table public.execution_logs drop constraint if exists execution_logs_step_check;

create table public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  description text,
  mode text not null check (mode in ('standard', 'deep')),
  model text,
  temperature numeric(3,2) not null default 0.35,
  workflow_prompt text not null check (char_length(workflow_prompt) <= 12000),
  tool_ids text[] not null default '{}',
  limits jsonb not null default '{}'::jsonb,
  based_on_preset text,
  version int not null default 1,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_profiles_user_idx on public.agent_profiles (user_id) where not is_archived;
alter table public.agent_profiles enable row level security;
create policy "Users can view own agent profiles" on public.agent_profiles for select using (auth.uid() = user_id);
create policy "Users can insert own agent profiles" on public.agent_profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own agent profiles" on public.agent_profiles for update using (auth.uid() = user_id);
create policy "Users can delete own agent profiles" on public.agent_profiles for delete using (auth.uid() = user_id);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  post_item_id uuid references public.post_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_ref text not null,
  profile_snapshot jsonb not null default '{}'::jsonb,
  status text not null check (status in ('running', 'completed', 'failed')),
  stop_reason text,
  model_calls int not null default 0,
  tool_calls int not null default 0,
  duration_ms int,
  word_count int,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index agent_runs_post_idx on public.agent_runs (post_item_id, created_at desc);
create index agent_runs_user_idx on public.agent_runs (user_id, created_at desc);
alter table public.agent_runs enable row level security;
create policy "Users can view own agent runs" on public.agent_runs for select using (auth.uid() = user_id);
create policy "Users can insert own agent runs" on public.agent_runs for insert with check (auth.uid() = user_id);
create policy "Users can update own agent runs" on public.agent_runs for update using (auth.uid() = user_id);

create table public.agent_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null check (slug ~ '^[a-z0-9-_]+$'),
  description text,
  content text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_agent_skills_user_id on public.agent_skills(user_id);
create index idx_agent_skills_slug on public.agent_skills(slug);
create index idx_agent_skills_system on public.agent_skills(is_system);
alter table public.agent_skills enable row level security;
create policy agent_skills_select_policy on public.agent_skills
  for select using (is_system = true or auth.uid() = user_id);
create policy agent_skills_insert_policy on public.agent_skills
  for insert with check (auth.uid() = user_id and is_system = false);
create policy agent_skills_update_policy on public.agent_skills
  for update using (auth.uid() = user_id and is_system = false) with check (auth.uid() = user_id and is_system = false);
create policy agent_skills_delete_policy on public.agent_skills
  for delete using (auth.uid() = user_id and is_system = false);

-- sql/uploaded_media.sql (versi dengan user_id nullable & policy bocor `user_id IS NULL`)
create table public.uploaded_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  site_id uuid references public.wp_sites(id) on delete cascade not null,
  post_id uuid references public.post_items(id) on delete set null,
  source_url text not null,
  site_url text not null,
  image_id bigint not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_uploaded_media_site_source on public.uploaded_media(site_id, source_url);
create index idx_uploaded_media_user on public.uploaded_media(user_id);
create index idx_uploaded_media_post on public.uploaded_media(post_id);
alter table public.uploaded_media enable row level security;
create policy "Users can manage their own uploaded media" on public.uploaded_media
  for all using (auth.uid() = user_id or user_id is null) with check (auth.uid() = user_id or user_id is null);

-- Tebakan: tabel dibuat manual lewat dashboard (worklog 23), lalu migrate-user-settings-*.js
create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  encrypted_openrouter_key text,
  notification_prefs jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.user_settings
  add column if not exists encrypted_tavily_key text,
  add column if not exists encrypted_brave_key text,
  add column if not exists encrypted_serpapi_key text,
  add column if not exists encrypted_pexels_key text,
  add column if not exists encrypted_unsplash_key text,
  add column if not exists search_preferences jsonb default '{"default_provider": "auto"}'::jsonb;
alter table public.user_settings
  add column if not exists searxng_url text,
  add column if not exists encrypted_pexafy_key text;
alter table public.user_settings enable row level security;
create policy "Users manage own settings" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  url text not null,
  encrypted_secret text not null,
  events jsonb default '[]'::jsonb,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.webhooks enable row level security;
create policy "Users manage own webhooks" on public.webhooks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
