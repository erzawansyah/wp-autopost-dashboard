-- =============================================================================
-- Panitera · Konvergensi kolom & trigger skema production lama (Rombak v2 · Fase 5b)
-- =============================================================================
-- Baseline sengaja tidak mengubah nullability/default kolom yang SUDAH ada. Inventaris production
-- (16 Okt 2026) menunjukkan 29 kolom yang di instalasi baru NOT NULL masih nullable (tanpa nilai NULL),
-- default yang berbeda (`content_batches.status` 'completed', `content_batches.total_items` 1), dan trigger
-- `trg_<tabel>_updated_at` lama yang menduplikasi `set_updated_at`. Migrasi ini menyamakannya dengan
-- instalasi baru, deterministik & idempoten:
--   1. Setiap kolom `NOT NULL DEFAULT …` di 10 tabel baseline: default diset ke nilai baseline; bila kolom
--      masih nullable, baris NULL diisi default lalu NOT NULL ditegakkan. Pada instalasi baru semuanya no-op.
--      Kode v2 selalu mengisi status/total_items batch secara eksplisit, jadi perubahan default tidak mengubah
--      perilaku aplikasi.
--   2. Trigger lama pada tabel aplikasi yang mengeksekusi `public.handle_updated_at()` (isinya hanya
--      `new.updated_at = now()`, duplikat `set_updated_at`) dihapus. Fungsinya sengaja DIBIARKAN: rollback
--      R1 (restore dump tabel lama) membuat ulang trigger lama yang merujuk fungsi ini.
-- Daftar kolom di bawah juga dicerminkan `pf_kolom_konvergensi()` di supabase/preflight/upgrade-v2.sql
-- (dijaga test `supabase/tests/preflight.test.ts`).
-- =============================================================================

do $$
declare
  spec record;
begin
  for spec in
    select *
    from (
      values
        ('wp_sites', 'status', $d$'connected'$d$),
        ('wp_sites', 'max_concurrency', '2'),
        ('wp_sites', 'created_at', 'now()'),
        ('wp_sites', 'updated_at', 'now()'),
        ('content_batches', 'source_type', $d$'manual'$d$),
        ('content_batches', 'execution_mode', $d$'immediate'$d$),
        ('content_batches', 'ai_config', $d$'{}'::jsonb$d$),
        ('content_batches', 'schedule_config', $d$'{}'::jsonb$d$),
        ('content_batches', 'status', $d$'draft'$d$),
        ('content_batches', 'total_items', '0'),
        ('content_batches', 'completed_items', '0'),
        ('content_batches', 'created_at', 'now()'),
        ('content_batches', 'updated_at', 'now()'),
        ('post_items', 'source_payload', $d$'{}'::jsonb$d$),
        ('post_items', 'categories', $d$'[]'::jsonb$d$),
        ('post_items', 'tags', $d$'[]'::jsonb$d$),
        ('post_items', 'state', $d$'queued_input'$d$),
        ('post_items', 'wp_target_status', $d$'draft'$d$),
        ('post_items', 'retry_count', '0'),
        ('post_items', 'created_at', 'now()'),
        ('post_items', 'updated_at', 'now()'),
        ('execution_logs', 'level', $d$'info'$d$),
        ('execution_logs', 'details', $d$'{}'::jsonb$d$),
        ('execution_logs', 'created_at', 'now()'),
        ('agent_profiles', 'temperature', '0.35'),
        ('agent_profiles', 'tool_ids', $d$'{}'::text[]$d$),
        ('agent_profiles', 'skills', $d$'{}'::text[]$d$),
        ('agent_profiles', 'limits', $d$'{}'::jsonb$d$),
        ('agent_profiles', 'version', '1'),
        ('agent_profiles', 'is_archived', 'false'),
        ('agent_profiles', 'created_at', 'now()'),
        ('agent_profiles', 'updated_at', 'now()'),
        ('agent_runs', 'profile_snapshot', $d$'{}'::jsonb$d$),
        ('agent_runs', 'model_calls', '0'),
        ('agent_runs', 'tool_calls', '0'),
        ('agent_runs', 'created_at', 'now()'),
        ('agent_skills', 'is_system', 'false'),
        ('agent_skills', 'created_at', 'now()'),
        ('agent_skills', 'updated_at', 'now()'),
        ('user_settings', 'search_preferences', $d$'{"default_provider": "auto"}'::jsonb$d$),
        ('user_settings', 'notification_prefs', $d$'{}'::jsonb$d$),
        ('user_settings', 'created_at', 'now()'),
        ('user_settings', 'updated_at', 'now()'),
        ('webhooks', 'events', $d$'[]'::jsonb$d$),
        ('webhooks', 'is_active', 'true'),
        ('webhooks', 'created_at', 'now()'),
        ('webhooks', 'updated_at', 'now()'),
        ('uploaded_media', 'metadata', $d$'{}'::jsonb$d$),
        ('uploaded_media', 'created_at', 'now()'),
        ('uploaded_media', 'updated_at', 'now()')
    ) as s (tabel, kolom, nilai_default)
  loop
    execute format('alter table public.%I alter column %I set default %s', spec.tabel, spec.kolom, spec.nilai_default);
    if exists (
      select 1
      from pg_attribute
      where attrelid = format('public.%I', spec.tabel)::regclass
        and attname = spec.kolom
        and not attisdropped
        and not attnotnull
    ) then
      execute format('update public.%I set %I = default where %I is null', spec.tabel, spec.kolom, spec.kolom);
      execute format('alter table public.%I alter column %I set not null', spec.tabel, spec.kolom);
    end if;
  end loop;
end;
$$;

do $$
declare
  legacy record;
begin
  if to_regprocedure('public.handle_updated_at()') is null then
    return;
  end if;
  for legacy in
    select c.relname as tabel, t.tgname as nama
    from pg_trigger as t
    join pg_class as c on c.oid = t.tgrelid
    where c.relnamespace = 'public'::regnamespace
      and not t.tgisinternal
      and t.tgfoid = 'public.handle_updated_at()'::regprocedure
      and c.relname in (
        'wp_sites', 'content_batches', 'post_items', 'execution_logs', 'agent_profiles',
        'agent_runs', 'agent_skills', 'user_settings', 'webhooks', 'uploaded_media'
      )
  loop
    execute format('drop trigger %I on public.%I', legacy.nama, legacy.tabel);
  end loop;
end;
$$;
