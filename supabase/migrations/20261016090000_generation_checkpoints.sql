-- =============================================================================
-- Panitera · Checkpoint generasi + metrik run agen (Rombak v2 · Fase 3 gelombang 2)
-- =============================================================================
-- 1. Tabel generation_checkpoints: hasil langkah generasi yang SUDAH selesai per item antrean,
--    sehingga percobaan berikutnya (retry otomatis, auto-healing lease, pelepasan klaim saat shutdown,
--    "Tulis ulang"/"Jalankan sekarang") melanjutkan dari langkah terakhir tanpa memanggil LLM ulang:
--      - pre_resolve : taksonomi & persona author hasil Pre-Flight Resolver (LLM + WordPress);
--      - draft       : naskah Markdown mentah + konteks pre_resolve + riset + media terunggah +
--                      pemakaian token langkah (postprocess deterministik dijalankan ulang).
--    `data` berversi (`schema_version`) dan memuat sidik input; versi/input yang tidak cocok diabaikan
--    runtime. Baris dihapus worker begitu naskah tersimpan di post_items (transisi ke syncing_to_wp)
--    dan ikut terhapus bersama item (FK komposit CASCADE).
--    Tenant hanya SELECT barisnya sendiri (dasbor); tulis hanya service_role. Jalur tulis worker
--    adalah RPC save_generation_checkpoint yang dipagari token klaim (`locked_by`) + state
--    `generating_content`, sehingga run basi yang kehilangan lease tidak menimpa checkpoint klaim baru.
-- 2. Metrik run di agent_runs (per percobaan; langkah yang dipakai ulang dari checkpoint tidak dihitung
--    ulang): model, llm_calls, tokens_total, cost_usd, model_usage, prompt_versions, resumed_steps.
--
-- Idempoten: tabel/kolom `if not exists`, constraint agent_runs drop-lalu-create, policy/trigger/fungsi
-- drop-lalu-create atau `create or replace`, hak akses dinyatakan ulang.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. generation_checkpoints
-- -----------------------------------------------------------------------------
-- Tabel baru (tidak ada versi lama): seluruh constraint didefinisikan langsung di CREATE TABLE.
-- Batas ukuran dihitung dari teks JSON; runtime menolak lebih dulu di bawah batas ini.
create table if not exists public.generation_checkpoints (
  id uuid primary key default gen_random_uuid(),
  post_item_id uuid not null,
  user_id uuid not null,
  step text not null,
  schema_version integer not null,
  data jsonb not null,
  prompt_versions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generation_checkpoints_post_item_id_step_key unique (post_item_id, step),
  constraint generation_checkpoints_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  -- FK komposit anti lintas-tenant: checkpoint selalu milik pemilik item yang sama.
  constraint generation_checkpoints_post_item_id_fkey
    foreign key (post_item_id, user_id) references public.post_items (id, user_id) on delete cascade,
  constraint generation_checkpoints_step_check check (step in ('pre_resolve', 'draft')),
  constraint generation_checkpoints_schema_version_check check (schema_version between 1 and 1000),
  constraint generation_checkpoints_data_check
    check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 262144),
  constraint generation_checkpoints_prompt_versions_check
    check (jsonb_typeof(prompt_versions) = 'object' and octet_length(prompt_versions::text) <= 16384)
);

comment on table public.generation_checkpoints is
  'Langkah generasi yang selesai per post_item (pre_resolve, draft) untuk resume tanpa LLM ulang. Ditulis worker via save_generation_checkpoint.';

-- FK post_item_id tercakup unique (post_item_id, step); FK user_id butuh indeks sendiri.
create index if not exists generation_checkpoints_user_id_idx
  on public.generation_checkpoints (user_id);

drop trigger if exists set_updated_at on public.generation_checkpoints;
create trigger set_updated_at before update on public.generation_checkpoints
  for each row execute function public.set_updated_at();

alter table public.generation_checkpoints enable row level security;
alter table public.generation_checkpoints force row level security;

-- Tabel milik worker: pengguna hanya membaca barisnya sendiri; tulis via service_role.
drop policy if exists generation_checkpoints_select_own on public.generation_checkpoints;
create policy generation_checkpoints_select_own on public.generation_checkpoints
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.generation_checkpoints from anon, authenticated;
grant select on table public.generation_checkpoints to authenticated;
grant select, insert, update, delete on table public.generation_checkpoints to service_role;


-- -----------------------------------------------------------------------------
-- 2. save_generation_checkpoint — upsert checkpoint dipagari klaim
-- -----------------------------------------------------------------------------
-- `true` = tersimpan; `false` = item tidak lagi dipegang token klaim ini dalam state generating_content
-- (lease dipulihkan auto-healing, dilepas saat shutdown, diklaim ulang, atau naskah sudah tersimpan).
-- Pemilik (`user_id`) diambil dari item, bukan dari parameter. Baris item dikunci FOR SHARE sehingga
-- pemulihan/pelepasan klaim yang berjalan bersamaan menunggu sampai checkpoint ini selesai ditulis
-- (checkpoint tidak pernah tertulis setelah klaim berpindah).
create or replace function public.save_generation_checkpoint(
  p_post_item_id uuid,
  p_lease_token text,
  p_step text,
  p_schema_version integer,
  p_data jsonb,
  p_prompt_versions jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_post_item_id is null or p_lease_token is null or char_length(btrim(p_lease_token)) = 0 then
    raise exception 'save_generation_checkpoint: p_post_item_id dan p_lease_token wajib diisi' using errcode = '22023';
  end if;

  select p.user_id into v_user_id
  from public.post_items as p
  where p.id = p_post_item_id
    and p.locked_by = p_lease_token
    and p.state = 'generating_content'
  for share;

  if v_user_id is null then
    return false;
  end if;

  insert into public.generation_checkpoints (post_item_id, user_id, step, schema_version, data, prompt_versions)
  values (p_post_item_id, v_user_id, p_step, p_schema_version, p_data, coalesce(p_prompt_versions, '{}'::jsonb))
  on conflict (post_item_id, step) do update
    set schema_version = excluded.schema_version,
        data = excluded.data,
        prompt_versions = excluded.prompt_versions;

  return true;
end;
$$;

comment on function public.save_generation_checkpoint(uuid, text, text, integer, jsonb, jsonb) is
  'Upsert checkpoint generasi bila item masih dipegang token klaim (locked_by) dalam state generating_content. Hanya service_role.';

revoke all on function public.save_generation_checkpoint(uuid, text, text, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_generation_checkpoint(uuid, text, text, integer, jsonb, jsonb)
  to service_role;


-- -----------------------------------------------------------------------------
-- 3. Metrik agent_runs (per percobaan)
-- -----------------------------------------------------------------------------
-- model           : model utama hasil resolusi gateway (resume dari draft: model penulis naskah).
-- llm_calls       : panggilan LLM sukses percobaan ini (agent loop, subagent, pre-resolve, finalize).
-- tokens_total    : total token percobaan ini (tokens_prompt/tokens_completion sudah ada).
-- cost_usd        : biaya USD menurut OpenRouter (`usage.cost`); null bila tidak dilaporkan.
-- model_usage     : rincian per model [{model, calls, failedCalls, promptTokens, ..., costUsd}].
-- prompt_versions : {"nama-prompt": "versi"} seluruh prompt yang dimuat percobaan ini.
-- resumed_steps   : langkah yang dipakai ulang dari generation_checkpoints (tanpa LLM).
alter table public.agent_runs
  add column if not exists model text,
  add column if not exists llm_calls integer not null default 0,
  add column if not exists tokens_total integer,
  add column if not exists cost_usd numeric(12, 6),
  add column if not exists model_usage jsonb not null default '[]'::jsonb,
  add column if not exists prompt_versions jsonb not null default '{}'::jsonb,
  add column if not exists resumed_steps text[] not null default '{}';

alter table public.agent_runs drop constraint if exists agent_runs_model_check;
alter table public.agent_runs add constraint agent_runs_model_check
  check (model is null or char_length(model) between 1 and 200);
alter table public.agent_runs drop constraint if exists agent_runs_metrics_check;
alter table public.agent_runs add constraint agent_runs_metrics_check
  check (
    llm_calls >= 0
    and (tokens_total is null or tokens_total >= 0)
    and (cost_usd is null or cost_usd >= 0)
  );
alter table public.agent_runs drop constraint if exists agent_runs_model_usage_check;
alter table public.agent_runs add constraint agent_runs_model_usage_check
  check (jsonb_typeof(model_usage) = 'array');
alter table public.agent_runs drop constraint if exists agent_runs_prompt_versions_check;
alter table public.agent_runs add constraint agent_runs_prompt_versions_check
  check (jsonb_typeof(prompt_versions) = 'object');
alter table public.agent_runs drop constraint if exists agent_runs_resumed_steps_check;
alter table public.agent_runs add constraint agent_runs_resumed_steps_check
  check (resumed_steps <@ array['pre_resolve', 'draft']::text[]);
