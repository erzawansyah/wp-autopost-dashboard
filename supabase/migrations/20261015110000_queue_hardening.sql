-- =============================================================================
-- Panitera · Hardening antrean (Rombak v2 · Fase 2, temuan review adversarial)
-- =============================================================================
-- 1. Kolom yang dikendalikan tenant saat INSERT dibatasi lewat GRANT per kolom: sesi pengguna hanya
--    boleh mengisi kolom input antrean. retry_count, last_error, created_at/updated_at, kolom lease &
--    backoff, naskah, dan wp_post_id/wp_post_url selalu memakai default (ditulis worker/service_role).
--    Sebelumnya tenant dapat menyisipkan retry_count = 2147483647 sehingga penulisan worker gagal
--    "integer out of range" dan item tersangkut in-flight.
-- 2. CHECK retry_count 0..1000 dan wp_sites.max_concurrency 1..10 (nilai lama di luar rentang
--    dinormalkan dulu agar constraint dapat dipasang).
-- 3. Token lease per klaim: claim_post_items menulis locked_by = '<worker>:<uuid acak>' sehingga pagar
--    (fencing) worker tidak dapat "hidup lagi" setelah item dipulihkan lalu diklaim ulang proses yang
--    sama (ABA). extend_post_item_lease menerima token tersebut lewat parameter p_worker.
--
-- Idempoten: UPDATE normalisasi hanya menyentuh baris di luar rentang; constraint/fungsi
-- drop-lalu-create; hak akses dinyatakan ulang.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. INSERT sesi pengguna hanya untuk kolom input antrean
-- -----------------------------------------------------------------------------
-- Mencabut hak INSERT tingkat tabel juga mencabut hak INSERT per kolom; lalu diberikan ulang per kolom.
-- Kolom yang dipakai src/server/queue/enqueue.ts (Tulis Cepat & batch).
revoke insert on table public.post_items from authenticated;
grant insert (
  user_id,
  batch_id,
  wp_site_id,
  target_keyword,
  title,
  state,
  scheduled_for,
  wp_target_status,
  categories,
  tags,
  custom_instructions_override,
  source_payload
) on table public.post_items to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Batas nilai numerik yang dapat dikendalikan tenant
-- -----------------------------------------------------------------------------
update public.post_items set retry_count = 1000 where retry_count > 1000;
alter table public.post_items drop constraint if exists post_items_retry_count_check;
alter table public.post_items add constraint post_items_retry_count_check
  check (retry_count between 0 and 1000);

-- wp_sites dapat di-UPDATE sesi pengguna (pengaturan situs); slot paralel per situs dibatasi 1..10.
update public.wp_sites set max_concurrency = 10 where max_concurrency > 10;
alter table public.wp_sites drop constraint if exists wp_sites_max_concurrency_check;
alter table public.wp_sites add constraint wp_sites_max_concurrency_check
  check (max_concurrency between 1 and 10);


-- -----------------------------------------------------------------------------
-- 3. claim_post_items — token lease unik per klaim
-- -----------------------------------------------------------------------------
-- Sama dengan versi 20261015100000_queue_leases.sql, kecuali locked_by = p_worker || ':' || 32 hex acak.
-- Worker memagari setiap penulisan state & heartbeat dengan token ini (bukan lagi retry_count).
create or replace function public.claim_post_items(
  p_worker text,
  p_limit integer,
  p_lease_seconds integer,
  p_user_id uuid default null
)
returns setof public.post_items
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_worker is null or char_length(btrim(p_worker)) = 0 or char_length(p_worker) > 160 then
    raise exception 'claim_post_items: p_worker wajib diisi (1–160 karakter)' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 then
    raise exception 'claim_post_items: p_lease_seconds minimal 30' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('panitera.claim_post_items', 0));

  return query
  with in_flight as (
    select p.wp_site_id, count(*)::integer as used
    from public.post_items as p
    where p.state in ('generating_content', 'syncing_to_wp')
      and (p.locked_until is null or p.locked_until > now())
    group by p.wp_site_id
  ),
  candidates as (
    select
      p.id,
      p.user_id,
      p.wp_site_id,
      p.created_at,
      coalesce(
        p.next_attempt_at,
        case
          when p.scheduled_for is null then p.created_at
          when coalesce(b.execution_mode, p.source_payload ->> 'execution_mode') = 'immediate' then p.created_at
          else p.scheduled_for - interval '10 minutes'
        end
      ) as due_at
    from public.post_items as p
    left join public.content_batches as b on b.id = p.batch_id
    where p.state in ('queued_input', 'ready_to_sync')
      and (p_user_id is null or p.user_id = p_user_id)
  ),
  per_site as (
    select
      c.id,
      c.user_id,
      c.due_at,
      c.created_at,
      row_number() over (partition by c.wp_site_id order by c.due_at, c.created_at, c.id) as site_rank,
      greatest(coalesce(s.max_concurrency, 2) - coalesce(f.used, 0), 0) as free_slots
    from candidates as c
    join public.wp_sites as s on s.id = c.wp_site_id
    left join in_flight as f on f.wp_site_id = c.wp_site_id
    where c.due_at <= now()
  ),
  fair as (
    select
      ps.id,
      ps.due_at,
      ps.created_at,
      row_number() over (partition by ps.user_id order by ps.due_at, ps.created_at, ps.id) as tenant_rank
    from per_site as ps
    where ps.site_rank <= ps.free_slots
  ),
  picked as (
    select f.id
    from fair as f
    order by f.tenant_rank, f.due_at, f.created_at, f.id
    limit p_limit
  ),
  locked as (
    select p.id
    from public.post_items as p
    where p.id in (select picked.id from picked)
      and p.state in ('queued_input', 'ready_to_sync')
    for update of p skip locked
  )
  update public.post_items as p
  set
    state = case when p.state = 'queued_input' then 'generating_content' else 'syncing_to_wp' end,
    locked_until = now() + make_interval(secs => p_lease_seconds),
    locked_by = p_worker || ':' || replace(gen_random_uuid()::text, '-', ''),
    next_attempt_at = null,
    last_error = null
  from locked
  where p.id = locked.id
  returning p.*;
end;
$$;

comment on function public.claim_post_items(text, integer, integer, uuid) is
  'Klaim atomik item antrean jatuh tempo + lease bertoken unik per klaim (per-site max_concurrency, adil antar tenant). Hanya service_role.';


-- -----------------------------------------------------------------------------
-- 4. extend_post_item_lease — heartbeat dengan token klaim
-- -----------------------------------------------------------------------------
-- Badan fungsi tidak berubah (`locked_by = p_worker`): worker kini mengirim TOKEN klaim sebagai
-- p_worker. Nama parameter sengaja dipertahankan karena `create or replace` di migrasi sebelumnya
-- tidak dapat mengganti nama parameter (penerapan ulang migrasi harus tetap idempoten).
comment on function public.extend_post_item_lease(uuid, text, integer) is
  'Heartbeat lease item in-flight; p_worker = token klaim (locked_by) hasil claim_post_items. Hanya service_role.';


-- -----------------------------------------------------------------------------
-- 5. Hak akses RPC antrean (hanya service_role)
-- -----------------------------------------------------------------------------
revoke all on function public.claim_post_items(text, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_post_items(text, integer, integer, uuid) to service_role;

revoke all on function public.extend_post_item_lease(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.extend_post_item_lease(uuid, text, integer) to service_role;
