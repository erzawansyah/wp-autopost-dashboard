-- =============================================================================
-- TEST-ONLY: prelude minimal yang meniru lingkungan Supabase untuk menguji migrasi
-- tanpa Docker (PGlite di Vitest, atau Postgres lokal biasa). JANGAN dijalankan ke
-- database Supabase sungguhan — di sana role, skema auth, dan fungsi ini sudah ada.
-- =============================================================================

-- Role Data API (PostgREST). service_role mem-bypass RLS seperti di Supabase.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

-- Skema auth minimal: hanya yang dirujuk migrasi (auth.users) dan policy (auth.uid()).
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);

-- Sama dengan implementasi Supabase: klaim `sub` dari `request.jwt.claims` (PostgREST)
-- atau `request.jwt.claim.sub` (gaya lama).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- Default privileges project Supabase lama: objek baru di `public` otomatis di-grant ke role API.
-- Migrasi harus tetap aman di bawah default ini (ia mencabut/menyatakan hak secara eksplisit).
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
