-- =============================================================================
-- Panitera · Lease antrean untuk durable queue runner (Rombak v2 · Fase 2)
-- =============================================================================
-- Runner antrean kini berjalan di proses Node.js yang berumur panjang (bukan di umur request
-- HTTP). Setiap item yang dikerjakan memegang LEASE (`locked_until` + `locked_by`) yang
-- diperpanjang heartbeat; item yang lease-nya kedaluwarsa dipulihkan auto-healing.
--
-- Kolom baru di post_items:
--   * locked_until    — batas akhir lease item in-flight (generating_content / syncing_to_wp);
--   * locked_by       — ID worker pemegang lease (hostname-pid-acak); NULL bila tidak dikunci;
--   * next_attempt_at — waktu paling awal item boleh diklaim lagi (backoff retry otomatis,
--                       "Jalankan sekarang", "Kirim ulang"). Bila terisi, nilai ini MENGGANTIKAN
--                       waktu jatuh tempo dari jadwal (lihat claim_post_items).
--
-- Fungsi RPC (hanya service_role; worker memakai Service Role key):
--   * claim_post_items(worker, limit, lease_seconds, user_id?) — klaim atomik item jatuh tempo
--     (queued_input → generating_content, ready_to_sync → syncing_to_wp) dengan batas
--     konkurensi per situs (wp_sites.max_concurrency) dan urutan adil antar-tenant;
--   * extend_post_item_lease(id, worker, lease_seconds) — heartbeat pemegang lease.
--
-- Idempoten: kolom `add column if not exists`, constraint/indeks drop-lalu-create atau
-- `if not exists`, fungsi `create or replace`, hak akses dinyatakan ulang.
-- Baris in-flight lama tanpa lease (diklaim worker versi sebelumnya) dipulihkan worker
-- berdasarkan `updated_at` + ambang stale lama, jadi migrasi ini tidak mengubah data.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Kolom lease & backoff
-- -----------------------------------------------------------------------------
alter table public.post_items
  add column if not exists locked_until timestamptz,
  add column if not exists locked_by text,
  add column if not exists next_attempt_at timestamptz;

comment on column public.post_items.locked_until is
  'Batas akhir lease item in-flight; diperpanjang heartbeat runner. Kedaluwarsa → dipulihkan auto-healing.';
comment on column public.post_items.locked_by is
  'ID worker pemegang lease (hostname-pid-acak). NULL bila item tidak sedang dikunci.';
comment on column public.post_items.next_attempt_at is
  'Waktu paling awal item boleh diklaim (backoff retry / jalankan sekarang). Bila terisi menggantikan jatuh tempo jadwal.';

-- Lease selalu berpasangan: dikunci (keduanya terisi) atau bebas (keduanya NULL).
alter table public.post_items drop constraint if exists post_items_lease_check;
alter table public.post_items add constraint post_items_lease_check
  check (
    (locked_until is null) = (locked_by is null)
    and (locked_by is null or char_length(locked_by) between 1 and 200)
  );


-- Sesi pengguna hanya MENGANTREKAN item baru: kolom lease & backoff milik worker (service_role),
-- jadi wajib kosong saat insert (melengkapi syarat baseline: queued_input tanpa naskah/wp_post_id).
drop policy if exists post_items_insert_own_queued on public.post_items;
create policy post_items_insert_own_queued on public.post_items
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and state = 'queued_input'
    and content_html is null
    and wp_post_id is null
    and wp_post_url is null
    and locked_until is null
    and locked_by is null
    and next_attempt_at is null
  );


-- -----------------------------------------------------------------------------
-- 2. Indeks
-- -----------------------------------------------------------------------------
-- Kandidat klaim: hanya item yang menunggu (indeks parsial kecil). claim_post_items memindai
-- subset ini lalu menghitung jatuh tempo (next_attempt_at / jadwal drip / urutan masuk).
create index if not exists post_items_claimable_idx
  on public.post_items (wp_site_id, created_at)
  where state in ('queued_input', 'ready_to_sync');

-- Item in-flight: hitung slot terpakai per situs + auto-healing lease kedaluwarsa.
create index if not exists post_items_in_flight_lease_idx
  on public.post_items (wp_site_id, locked_until)
  where state in ('generating_content', 'syncing_to_wp');

-- Digantikan dua indeks di atas (klaim lama: state + scheduled_for/created_at; healing lama: updated_at).
drop index if exists public.post_items_state_scheduled_for_idx;
drop index if exists public.post_items_state_created_at_idx;
drop index if exists public.post_items_in_flight_updated_at_idx;


-- -----------------------------------------------------------------------------
-- 3. claim_post_items — klaim atomik dengan lease & batas konkurensi per situs
-- -----------------------------------------------------------------------------
-- Jatuh tempo (due_at) sebuah kandidat:
--   * next_attempt_at bila terisi (backoff, "Jalankan sekarang", "Kirim ulang");
--   * selain itu: tanpa jadwal atau batch mode `immediate` → created_at (langsung);
--     mode bertahap (scheduled_drip / wp_future) → scheduled_for − 10 menit, agar naskah siap
--     dan dikirim sebagai `future` tepat di jam tayang (perilaku worker lama dipertahankan).
-- Slot per situs = wp_sites.max_concurrency − item in-flight dengan lease aktif (lease NULL dari
-- worker lama tetap dihitung terpakai sampai dipulihkan; lease kedaluwarsa tidak dihitung).
-- Urutan adil: giliran per tenant (round-robin) lalu jatuh tempo terlama.
-- Klaim antar worker diserialkan advisory lock transaksi agar hitungan slot tidak balapan;
-- FOR UPDATE SKIP LOCKED melewati baris yang sedang diubah transaksi lain.
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
  if p_worker is null or char_length(btrim(p_worker)) = 0 or char_length(p_worker) > 200 then
    raise exception 'claim_post_items: p_worker wajib diisi (1–200 karakter)' using errcode = '22023';
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
    locked_by = p_worker,
    next_attempt_at = null,
    last_error = null
  from locked
  where p.id = locked.id
  returning p.*;
end;
$$;

comment on function public.claim_post_items(text, integer, integer, uuid) is
  'Klaim atomik item antrean jatuh tempo + lease (per-site max_concurrency, adil antar tenant). Hanya service_role.';


-- -----------------------------------------------------------------------------
-- 4. extend_post_item_lease — heartbeat pemegang lease
-- -----------------------------------------------------------------------------
-- Hanya pemegang lease (locked_by sama) dan hanya selama item masih in-flight. Item yang sudah
-- dipulihkan auto-healing / dilepas saat shutdown (locked_by NULL) tidak dapat diperpanjang lagi.
create or replace function public.extend_post_item_lease(
  p_id uuid,
  p_worker text,
  p_lease_seconds integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  extended integer;
begin
  if p_lease_seconds is null or p_lease_seconds < 30 then
    raise exception 'extend_post_item_lease: p_lease_seconds minimal 30' using errcode = '22023';
  end if;

  update public.post_items
  set locked_until = now() + make_interval(secs => p_lease_seconds)
  where id = p_id
    and locked_by = p_worker
    and state in ('generating_content', 'syncing_to_wp');

  get diagnostics extended = row_count;
  return extended > 0;
end;
$$;

comment on function public.extend_post_item_lease(uuid, text, integer) is
  'Heartbeat lease item in-flight; hanya oleh worker pemegang lease. Hanya service_role.';


-- -----------------------------------------------------------------------------
-- 5. Hak akses: RPC antrean hanya untuk service_role (bukan Data API sesi pengguna)
-- -----------------------------------------------------------------------------
revoke all on function public.claim_post_items(text, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_post_items(text, integer, integer, uuid) to service_role;

revoke all on function public.extend_post_item_lease(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.extend_post_item_lease(uuid, text, integer) to service_role;
