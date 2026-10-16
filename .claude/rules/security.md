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
- Respons API ke client hanya boleh memuat versi tersamar (mis. `sk-or-…a1b2`) atau flag `hasKey: true`. Nilai terenkripsi juga tidak boleh dikembalikan.
- BYOK-only: kunci tenant tidak pernah jatuh ke kunci platform (`process.env`), kecuali operator men-set `PLATFORM_KEY_ALLOWED=true` (`src/lib/ai/platform-keys.ts`). Jangan pernah menulis ke `process.env` atau berkas `.env*` saat runtime, dan jangan menyimpan kunci di localStorage.
- Log, telemetri, hasil tool, dan respons Lab wajib melewati `redactSecrets()` / `redactSecretsInText()` (`src/lib/security/redact.ts`).
- Kunci master diambil dari `ENCRYPTION_MASTER_KEY` (32 byte / 64 karakter hex). Jangan pernah menulis fallback kunci di kode.

## 3. Anti-SSRF untuk URL Input Pengguna
- Setiap request keluar ke URL yang berasal dari pengguna **atau LLM** (situs WordPress, `web_reader`, `upload_media`, SearXNG kustom, webhook) wajib memakai `safeFetch()` dari `src/lib/net/safe-fetch.ts`; jangan memakai `fetch()` langsung. Request ke situs WordPress lewat `wpFetch` di `src/lib/wordpress/client.ts`.
- URL yang disimpan (webhook, SearXNG kustom, situs) divalidasi dulu dengan `assertSafeUrl()`.
- `safeFetch` memblokir loopback, RFC 1918, CGNAT, link-local & metadata cloud, multicast/reserved, IPv6 privat & IPv4-mapped, termasuk alamat hasil resolve DNS (DNS pinning) dan setiap hop redirect. Satu-satunya pengecualian: endpoint `/search` & `/autocompleter` SearXNG platform (`SEARXNG_URL`), dan hanya jika pemanggil memberi opsi `{ platformSearxng: true }` (dipakai helper pencarian saja). Base URL SearXNG selalu dinormalisasi dengan `toSearxngBaseUrl()` (tanpa query/fragment). Akses jaringan privat untuk dev: `ALLOW_PRIVATE_NETWORK_FETCH=true` (diabaikan di production).
- Jangan melonggarkan aturan ini; tambahkan test di `safe-fetch.test.ts` bila mengubahnya.

## 4. Perlindungan Hosting WordPress Pengguna
- Beban ke satu domain WP dibatasi concurrency per situs: maks `wp_sites.max_concurrency` item antrean diproses paralel (default 2, rentang 1–10), ditegakkan RPC `claim_post_items`.
- Gunakan timeout eksplisit pada setiap `fetch` ke WordPress dan layanan eksternal.

## 5. Zero Secret Leaks
- Secret nyata hanya di `.env.local` / `.env` (di-ignore Git). `.env.example` hanya berisi placeholder.
- Dilarang menulis secret nyata (Service Role key, API key, Application Password, connection string) ke berkas yang di-track Git, termasuk dokumen, worklog, test fixture, dan pesan commit.
- Hook `.claude/hooks/guard-secrets.mjs` memblokir penulisan pola secret dan akses ke berkas `.env*`. Jangan mencoba mengakalinya.
