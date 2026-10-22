-- =============================================================================
-- Panitera · Rencana kata kunci batch Tulis Niche (`content_batches.source_type = 'niche_auto'`)
-- =============================================================================
-- Batch Tulis Niche dibuat dengan N item `queued_input` ber-`target_keyword` kosong (menunggu kata kunci AI)
-- dan `source_payload.slot_index` 0..N-1. Klaim pertama yang menemukan kata kunci kosong menyusun SELURUH
-- rencana sekali jalan (LLM, `src/core/queue/niche-keywords.ts`) lalu menyimpannya lewat RPC di bawah:
--   - rencana disimpan di `content_batches.ai_config.niche_keywords` (array teks, indeks = slot_index);
--   - setiap item batch yang kata kuncinya masih kosong diisi `niche_keywords[slot_index]` (tampil di Antrean);
--   - penulis pertama menang: baris batch dikunci FOR UPDATE, klaim lain yang menyusun bersamaan menerima
--     rencana yang sudah tersimpan (rencananya sendiri dibuang) sehingga tidak ada kata kunci ganda.
-- Dipagari token klaim (`locked_by`) + state `generating_content` seperti `save_generation_checkpoint`:
-- run basi yang kehilangan lease tidak dapat menulis rencana.
--
-- Trigger Broadcast `broadcast_post_item_update` (migrasi *_realtime_broadcast.sql) ikut mengirim
-- `target_keyword` agar kata kunci hasil rencana langsung tampil di dasbor. Bagian ini hanya dijalankan bila
-- skema Realtime Supabase tersedia (sama dengan migrasi aslinya).
--
-- Idempoten: fungsi `create or replace`, trigger drop-lalu-create, hak akses dinyatakan ulang.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. assign_niche_keywords — simpan rencana kata kunci batch (penulis pertama menang)
-- -----------------------------------------------------------------------------
-- Mengembalikan rencana yang BERLAKU (milik pemanggil atau yang sudah tersimpan lebih dulu), atau NULL bila
-- item tidak lagi dipegang token klaim ini dalam state generating_content, tidak ber-batch, atau batch-nya
-- bukan batch Tulis Niche milik pemilik item. Pemilik (`user_id`) diambil dari item, bukan dari parameter.
create or replace function public.assign_niche_keywords(
  p_post_item_id uuid,
  p_lease_token text,
  p_keywords text[]
)
returns text[]
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_batch_id uuid;
  v_plan jsonb;
begin
  if p_post_item_id is null or p_lease_token is null or char_length(btrim(p_lease_token)) = 0 then
    raise exception 'assign_niche_keywords: p_post_item_id dan p_lease_token wajib diisi' using errcode = '22023';
  end if;
  if p_keywords is null
    or cardinality(p_keywords) not between 1 and 100
    or exists (select 1 from unnest(p_keywords) as kw where kw is null or char_length(btrim(kw)) not between 1 and 300)
  then
    raise exception 'assign_niche_keywords: p_keywords wajib 1..100 kata kunci tidak kosong (maks. 300 karakter)'
      using errcode = '22023';
  end if;

  select p.user_id, p.batch_id into v_user_id, v_batch_id
  from public.post_items as p
  where p.id = p_post_item_id
    and p.locked_by = p_lease_token
    and p.state = 'generating_content'
  for share;

  if v_user_id is null or v_batch_id is null then
    return null;
  end if;

  select coalesce(b.ai_config -> 'niche_keywords', 'null'::jsonb) into v_plan
  from public.content_batches as b
  where b.id = v_batch_id
    and b.user_id = v_user_id
    and b.source_type = 'niche_auto'
  for update;

  if v_plan is null then
    return null;
  end if;

  if jsonb_typeof(v_plan) = 'array' then
    return array(select jsonb_array_elements_text(v_plan));
  end if;

  update public.content_batches
  set ai_config = ai_config || jsonb_build_object('niche_keywords', to_jsonb(p_keywords))
  where id = v_batch_id;

  -- `slot_index` berasal dari jsonb: hanya bilangan bulat dalam rentang rencana yang dipakai (cast dijaga CASE).
  update public.post_items as p
  set target_keyword = btrim(p_keywords[slot.idx + 1])
  from (
    select item.id,
      case when item.source_payload ->> 'slot_index' ~ '^[0-9]{1,3}$'
        then (item.source_payload ->> 'slot_index')::integer
      end as idx
    from public.post_items as item
    where item.batch_id = v_batch_id
      and item.user_id = v_user_id
      and item.target_keyword = ''
  ) as slot
  where p.id = slot.id
    and slot.idx < cardinality(p_keywords);

  return p_keywords;
end;
$$;

comment on function public.assign_niche_keywords(uuid, text, text[]) is
  'Simpan rencana kata kunci batch Tulis Niche (ai_config.niche_keywords) + isi target_keyword item kosong per slot_index; penulis pertama menang. Dipagari token klaim + generating_content. Hanya service_role.';

revoke all on function public.assign_niche_keywords(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.assign_niche_keywords(uuid, text, text[]) to service_role;


-- -----------------------------------------------------------------------------
-- 2. Broadcast `target_keyword` (hanya bila Realtime Supabase tersedia)
-- -----------------------------------------------------------------------------
do $migration$
begin
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null
    or to_regprocedure('realtime.topic()') is null
    or to_regclass('realtime.messages') is null then
    raise notice 'Skema Realtime Supabase tidak tersedia; trigger Broadcast tidak diperbarui.';
    return;
  end if;

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
            'target_keyword', left(new.target_keyword, 300),
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

  execute 'revoke all on function public.broadcast_post_item_update() from public, anon, authenticated';

  execute 'drop trigger if exists broadcast_post_item_update on public.post_items';
  execute $sql$
    create trigger broadcast_post_item_update
      after update on public.post_items
      for each row
      when (
        (old.state, old.target_keyword, old.title, old.batch_id, old.wp_target_status, old.wp_post_id,
         old.wp_post_url, old.scheduled_for, old.next_attempt_at, old.retry_count, old.last_error)
        is distinct from
        (new.state, new.target_keyword, new.title, new.batch_id, new.wp_target_status, new.wp_post_id,
         new.wp_post_url, new.scheduled_for, new.next_attempt_at, new.retry_count, new.last_error)
      )
      execute function public.broadcast_post_item_update()
  $sql$;
end;
$migration$;
