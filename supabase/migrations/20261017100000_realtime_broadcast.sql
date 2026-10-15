-- =============================================================================
-- Panitera · Realtime privat lewat Broadcast dari database (menggantikan Postgres Changes)
-- =============================================================================
-- Migrasi 20261017090000 mendaftarkan post_items & execution_logs ke publication `supabase_realtime`
-- (Postgres Changes). Hasil review keamanan: event DELETE Postgres Changes tidak melewati RLS maupun filter
-- (pengguna login mana pun dapat berlangganan DELETE tanpa filter dan menerima `old_record.id` milik semua
-- tenant), dan setiap event INSERT/UPDATE diotorisasi ulang per pelanggan (beban RLS per tulis worker).
--
-- Pola baru (rekomendasi Supabase "Broadcast from the database"):
--   1. post_items & execution_logs DIKELUARKAN dari publication `supabase_realtime`.
--   2. Trigger AFTER memanggil `realtime.send(payload, event, topic, private => true)` dengan payload
--      ringkas (tanpa content_html, source_payload, lease, maupun kolom sensitif lain) ke topik PRIVAT:
--        user:<user_id>:queue                 event `post_item` (UPDATE kolom status), `post_items_inserted`,
--                                             `post_items_deleted` (per statement, per pemilik)
--        user:<user_id>:post:<post_item_id>   event `execution_log` (log baru; `details` > 32 KiB tidak
--                                             dikirim → klien mengambil ulang detail)
--      UPDATE yang hanya menyentuh heartbeat/lease (`updated_at`, `locked_*`) TIDAK dibroadcast.
--   3. Policy SELECT pada `realtime.messages`: `authenticated` hanya boleh join topik Broadcast berawalan
--      `user:<auth.uid()>:` (Realtime Authorization; dievaluasi sekali saat join, bukan per pesan).
--
-- Fungsi trigger SECURITY DEFINER + `search_path = ''` (pola dokumentasi Supabase: menulis ke
-- realtime.messages tanpa policy INSERT untuk role API); EXECUTE dicabut dari public/anon/authenticated
-- (trigger tetap jalan — hak EXECUTE hanya diperiksa saat CREATE TRIGGER).
--
-- Idempoten & portabel: bagian publication hanya bila `supabase_realtime` ada (dan bukan FOR ALL TABLES);
-- fungsi, trigger, dan policy hanya dibuat bila skema Realtime Supabase tersedia (`realtime.send`,
-- `realtime.topic`, `realtime.messages`) — Postgres polos / test PGlite melewatinya dengan NOTICE.
--
-- Deploy: setelah `db push`, matikan "Allow public access" di Dashboard → Realtime → Settings agar kanal
-- privat ditegakkan, dan pastikan tidak ada policy SELECT longgar (`using (true)`) lain pada
-- realtime.messages (policy permissive digabung OR).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Postgres Changes dimatikan untuk tabel antrean
-- -----------------------------------------------------------------------------
do $$
declare
  target text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables
  ) then
    raise notice 'Publication supabase_realtime tidak ada (atau FOR ALL TABLES); tidak ada tabel yang dikeluarkan.';
    return;
  end if;

  foreach target in array array['post_items', 'execution_logs']
  loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', target);
    end if;
  end loop;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2 & 3. Trigger Broadcast + otorisasi topik (hanya bila Realtime Supabase tersedia)
-- -----------------------------------------------------------------------------
do $migration$
begin
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null
    or to_regprocedure('realtime.topic()') is null
    or to_regclass('realtime.messages') is null then
    raise notice 'Skema Realtime Supabase tidak tersedia; trigger Broadcast & policy realtime.messages dilewati.';
    return;
  end if;

  -- 2a. Perubahan kolom status item → topik antrean pemilik.
  execute $sql$
    create or replace function public.broadcast_post_item_update()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $fn$
    begin
      perform realtime.send(
        jsonb_build_object(
          'op', 'UPDATE',
          'record', jsonb_build_object(
            'id', new.id,
            'batch_id', new.batch_id,
            'state', new.state,
            'title', new.title,
            'wp_target_status', new.wp_target_status,
            'wp_post_id', new.wp_post_id,
            'wp_post_url', new.wp_post_url,
            'scheduled_for', new.scheduled_for,
            'next_attempt_at', new.next_attempt_at,
            'retry_count', new.retry_count,
            'last_error', left(new.last_error, 2000),
            'updated_at', new.updated_at
          )
        ),
        'post_item',
        'user:' || new.user_id::text || ':queue',
        true
      );
      return null;
    end;
    $fn$
  $sql$;

  -- 2b. Item baru (per statement, satu pesan per pemilik — batch 50 item = 1 pesan).
  execute $sql$
    create or replace function public.broadcast_post_items_inserted()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $fn$
    begin
      perform realtime.send(
        jsonb_build_object('op', 'INSERT', 'count', inserted.total),
        'post_items_inserted',
        'user:' || inserted.user_id::text || ':queue',
        true
      )
      from (select new_rows.user_id, count(*) as total from new_rows group by new_rows.user_id) as inserted;
      return null;
    end;
    $fn$
  $sql$;

  -- 2c. Item terhapus (per statement, per pemilik; ID dibatasi 500 — lebih dari itu klien memuat ulang daftar).
  execute $sql$
    create or replace function public.broadcast_post_items_deleted()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $fn$
    begin
      perform realtime.send(
        jsonb_build_object(
          'op', 'DELETE',
          'count', deleted.total,
          'ids', case when deleted.total <= 500 then deleted.ids else null end
        ),
        'post_items_deleted',
        'user:' || deleted.user_id::text || ':queue',
        true
      )
      from (
        select old_rows.user_id, count(*) as total, jsonb_agg(old_rows.id) as ids
        from old_rows
        group by old_rows.user_id
      ) as deleted;
      return null;
    end;
    $fn$
  $sql$;

  -- 2d. Log eksekusi baru → topik detail artikel pemilik.
  execute $sql$
    create or replace function public.broadcast_execution_log()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $fn$
    declare
      details_too_large boolean := coalesce(octet_length(new.details::text) > 32768, false);
    begin
      perform realtime.send(
        jsonb_build_object(
          'post_item_id', new.post_item_id,
          'details_truncated', details_too_large,
          'log', jsonb_build_object(
            'id', new.id,
            'step', new.step,
            'level', new.level,
            'message', new.message,
            'details', case when details_too_large then null else new.details end,
            'created_at', new.created_at
          )
        ),
        'execution_log',
        'user:' || new.user_id::text || ':post:' || new.post_item_id::text,
        true
      );
      return null;
    end;
    $fn$
  $sql$;

  execute 'revoke all on function public.broadcast_post_item_update() from public, anon, authenticated';
  execute 'revoke all on function public.broadcast_post_items_inserted() from public, anon, authenticated';
  execute 'revoke all on function public.broadcast_post_items_deleted() from public, anon, authenticated';
  execute 'revoke all on function public.broadcast_execution_log() from public, anon, authenticated';

  -- Hanya kolom yang ditampilkan dasbor; heartbeat/lease worker (updated_at, locked_*) tidak memicu pesan.
  execute 'drop trigger if exists broadcast_post_item_update on public.post_items';
  execute $sql$
    create trigger broadcast_post_item_update
      after update on public.post_items
      for each row
      when (
        (old.state, old.title, old.batch_id, old.wp_target_status, old.wp_post_id, old.wp_post_url,
         old.scheduled_for, old.next_attempt_at, old.retry_count, old.last_error)
        is distinct from
        (new.state, new.title, new.batch_id, new.wp_target_status, new.wp_post_id, new.wp_post_url,
         new.scheduled_for, new.next_attempt_at, new.retry_count, new.last_error)
      )
      execute function public.broadcast_post_item_update()
  $sql$;

  execute 'drop trigger if exists broadcast_post_items_inserted on public.post_items';
  execute $sql$
    create trigger broadcast_post_items_inserted
      after insert on public.post_items
      referencing new table as new_rows
      for each statement
      execute function public.broadcast_post_items_inserted()
  $sql$;

  execute 'drop trigger if exists broadcast_post_items_deleted on public.post_items';
  execute $sql$
    create trigger broadcast_post_items_deleted
      after delete on public.post_items
      referencing old table as old_rows
      for each statement
      execute function public.broadcast_post_items_deleted()
  $sql$;

  execute 'drop trigger if exists broadcast_execution_log on public.execution_logs';
  execute $sql$
    create trigger broadcast_execution_log
      after insert on public.execution_logs
      for each row
      execute function public.broadcast_execution_log()
  $sql$;

  -- 3. Realtime Authorization: join topik Broadcast hanya untuk topik milik sendiri. RLS realtime.messages
  --    sudah aktif di Supabase (jangan `alter table ... enable row level security`: bukan pemilik tabel).
  execute 'drop policy if exists panitera_receive_own_user_topics on realtime.messages';
  execute $sql$
    create policy panitera_receive_own_user_topics
      on realtime.messages
      for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and starts_with((select realtime.topic()), 'user:' || (select auth.uid())::text || ':')
      )
  $sql$;
end;
$migration$;
