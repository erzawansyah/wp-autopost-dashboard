# Keamanan Multi-Tenant, Kredensial & Anti-SSRF

Berlaku untuk seluruh kode. Panitera adalah SaaS multi-tenant yang menyimpan kredensial WordPress dan API key milik pengguna.

## 1. Isolasi Tenant (Supabase RLS)
- RLS **wajib aktif** di seluruh tabel Supabase. Setiap tabel baru wajib disertai policy RLS berbasis `auth.uid()` di migrasi yang sama.
- Route API yang melayani pengguna memakai client sesi pengguna: `createClient()` dari `src/lib/supabase/server.ts`.
- `createAdminClient()` (`src/lib/supabase/admin.ts`, Service Role, mem-bypass RLS) **hanya** untuk proses latar belakang/sistem (queue worker, resolusi skill sistem). Jika terpaksa dipakai dalam konteks pengguna, query wajib difilter eksplisit dengan `user_id` pemilik.
- Jangan pernah mengimpor modul yang memakai Service Role key ke Client Component.

## 2. Enkripsi Kredensial (AES-256-GCM)
- WordPress Application Password dan seluruh API key BYOK (OpenRouter, Tavily, Brave, SerpAPI, Pexafy, dll.) **wajib** dienkripsi dengan `encryptCredential()` dari `src/lib/crypto.ts` sebelum disimpan ke database.
- Dekripsi (`decryptCredential()`) hanya di server. Nilai terdekripsi tidak boleh dikirim ke browser, ditulis ke log, `execution_logs`, telemetri, atau pesan error.
- Respons API ke client hanya boleh memuat versi tersamar (mis. `sk-or-…a1b2`) atau flag `hasKey: true`.
- Kunci master diambil dari `ENCRYPTION_MASTER_KEY` (32 byte / 64 karakter hex). Jangan pernah menulis fallback kunci di kode.

## 3. Anti-SSRF untuk URL Input Pengguna
- Setiap request keluar ke URL yang diinput pengguna (situs WordPress, `web_reader`, webhook) wajib melewati validasi `normalizeAndValidateWpUrl()` (`src/lib/wordpress/client.ts`) atau validator setara.
- Standar yang dituju: tolak `localhost`, loopback (`127.0.0.0/8`, `::1`), RFC 1918 (`10/8`, `172.16/12`, `192.168/16`), link-local & metadata cloud (`169.254.0.0/16`, `metadata.google.internal`), `0.0.0.0`, serta IPv6 privat (`fc00::/7`, `fe80::/10`). Produksi wajib HTTPS.
- Saat menyentuh validator ini, perkuat ke arah standar di atas; jangan pernah melonggarkannya.

## 4. Perlindungan Hosting WordPress Pengguna
- Request ke satu domain WP dibatasi concurrency per situs (default maks 2 paralel, kolom `sites.max_concurrency`).
- Gunakan timeout eksplisit pada setiap `fetch` ke WordPress dan layanan eksternal.

## 5. Zero Secret Leaks
- Secret nyata hanya di `.env.local` / `.env` (di-ignore Git). `.env.example` hanya berisi placeholder.
- Dilarang menulis secret nyata (Service Role key, API key, Application Password, connection string) ke berkas yang di-track Git, termasuk dokumen, worklog, test fixture, dan pesan commit.
- Hook `.claude/hooks/guard-secrets.mjs` memblokir penulisan pola secret dan akses ke berkas `.env*`. Jangan mencoba mengakalinya.
