# Runbook Upgrade Production `main` → `v2` (Sekali Jalan)

Runbook berlangkah untuk memindahkan production yang berjalan dari branch `main` (Docker Compose di VPS + Supabase Cloud, skema dibuat skrip ad-hoc tanpa riwayat migrasi) ke branch `v2`. Centang setiap langkah dan catat waktunya. Operasi sehari-hari setelah upgrade: [`docker-compose-vps.md`](docker-compose-vps.md) (selanjutnya "panduan VPS").

> **Selesai 16 Okt 2026.** Branch `v2` kemudian digabung ke `main` (tag `v0.2.0`); versi lama ditandai tag `v0.1.2` (commit `624f37c`). Rujukan branch `v2` di runbook ini bersifat historis (kode yang dideploy saat upgrade: commit `e84c38f`).

**Placeholder:** `<MAIN_COMMIT>` (commit production sekarang), `<V2_COMMIT>` (commit v2 yang dideploy), `<PROJECT_REF>`, `<POOLER_HOST>`, `<DEPLOY_DIR>` (folder checkout di VPS). Nama project Compose = nama folder `<DEPLOY_DIR>`; contoh di bawah memakai `wp-autopost-dashboard`, sehingga image aplikasi bernama `wp-autopost-dashboard-panitera` — cek dengan `docker compose config --images`. Koneksi database memakai `DB_URL` + `PGPASSWORD` seperti panduan VPS §2.

**Peran:** operator (menjalankan langkah) dan pemilik produk (keputusan GO/rollback, keputusan perbaikan data). Rencanakan jendela pemeliharaan ±90 menit.

### Baca dulu: risiko & titik keputusan

1. **Titik tanpa-kembali = langkah h.9** (akses pengguna dibuka lagi). Sampai saat itu tersedia rollback penuh R1 — restore tabel aplikasi dari dump + image lama — yang diuji pada Postgres 16 lokal dengan CLI 2.121.0 (skema & data kembali identik, kecuali fungsi `set_updated_at` yang sengaja ditinggal). Setelah h.9 strateginya roll-forward (§j).
2. **Kode `main` tidak aman dijalankan di atas skema v2**: tombol "Kirim ulang" `main` gagal menulis status secara diam-diam lalu dapat membuat posting ganda di WordPress (§j.1). Jangan menyalakan image lama setelah migrasi tanpa R1.
3. Sumber kegagalan migrasi paling mungkin: data/tipe kolom production yang berbeda dari rekonstruksi baseline. Pre-flight (§c) wajib dijalankan H-1 dan diulang tepat sebelum migrasi.
4. Pengguna yang kunci OpenRouter-nya hanya tersimpan di browser harus mengisi ulang di **Pengaturan → Kunci API**.
5. Situs WordPress yang `base_url`-nya redirect atau host-nya resolve ke IP privat akan gagal publish (`failed_sync`) — cek di b.8.

---

## (a) Ringkasan perubahan yang berdampak ke production

Hasil analisis `git diff origin/main..v2` (kode, compose, Dockerfile, migrasi).

| Area | `main` (production sekarang) | `v2` | Dampak & tindakan |
| :--- | :--- | :--- | :--- |
| Runtime | `node:20-alpine`, Next.js 16.3.6; prompt dibaca dari `src/core` di image | `node:22-alpine`, Next.js 16.4.2 (memuat patch keamanan 16.4.1); prompt dibundel saat build | Image wajib dibangun ulang. Node ≥ 22 di host hanya untuk mesin yang menjalankan CLI (`engines`). |
| Penggerak antrean | Sidecar `queue-cron` (container `panitera-cron`, alpine + curl) memanggil `POST /api/queue/process?limit=$QUEUE_CRON_LIMIT` tiap 60 detik, volume `panitera_cron_logs`; Tulis Cepat/batch langsung menjalankan job di `after()` | Runner tertanam di proses `panitera` (`QUEUE_RUNNER=embedded`): RPC `claim_post_items` + lease/heartbeat, batas per situs, giliran adil antar-tenant, backoff 1→5 menit maks 3 percobaan, graceful shutdown (`stop_grace_period: 40s`) | `docker compose up -d --remove-orphans` membuang `panitera-cron`. Volume `panitera_cron_logs` boleh dihapus setelah upgrade stabil. Cron eksternal (crontab host) ke `/api/queue/process` tidak lagi dibutuhkan; bila tetap ada, secret hanya diterima lewat header (`?secret=` → 401) dan `?limit=` diabaikan. |
| Pemulihan item macet | Item `generating_content` **dan** `syncing_to_wp` yang > 10 menit dikembalikan ke `queued_input` → digenerasi ulang (`syncing_to_wp` dapat menggandakan posting) | Lease kedaluwarsa: `generating_content` → antre ulang (`retry_count`+1, backoff); `syncing_to_wp` → `failed_sync` (atau sukses bila `wp_post_id` tercatat), tidak pernah digenerasi ulang | Item in-flight dari `main` (tanpa lease) dipulihkan v2 ±15 menit setelah `updated_at` terakhir. |
| Env | `CRON_SECRET`, `QUEUE_CRON_LIMIT`, `WEBHOOK_SIGNATURE_SECRET` (tidak pernah dibaca kode), `SEARXNG_SECRET` punya default di compose | Wajib: `SEARXNG_SECRET` (tanpa default — compose menolak berjalan). Baru: `NEXT_PUBLIC_APP_URL` (disarankan), `QUEUE_RUNNER`, `QUEUE_CONCURRENCY`/`QUEUE_POLL_INTERVAL_MS`/`QUEUE_LEASE_SECONDS`, `PLATFORM_KEY_ALLOWED` (+ `OPENROUTER_API_KEY`/`PEXAFY_API_KEY`), `OPENROUTER_DEFAULT_MODEL`, `DEFAULT_AI_MODEL`, `LANGSMITH_TRACING`. Dihapus: `QUEUE_CRON_LIMIT`, `WEBHOOK_SIGNATURE_SECRET`. Validasi saat start: production gagal start bila variabel inti tidak valid; `ENCRYPTION_MASTER_KEY` wajib persis 64 hex | Lengkapi `.env` (b.9/f.2). Pertahankan `ENCRYPTION_MASTER_KEY` yang sama (b.4). Isi `SEARXNG_SECRET` (nilai lama boleh dipakai). |
| Kunci API (BYOK) | Worker memakai kunci OpenRouter yang dikirim browser dari `localStorage` bila ada, lalu kunci di `user_settings`; ada cadangan `process.env.OPENROUTER_API_KEY`/`PEXAFY_API_KEY` (tidak diteruskan compose `main`, jadi praktis tidak aktif); halaman `/settings/search` juga menulis kunci Tavily/Brave ke `.env.local` di dalam container (terbaca semua tenant) | BYOK-only: hanya ciphertext `user_settings` milik tenant; tanpa cadangan kunci platform (`PLATFORM_KEY_ALLOWED=false`); `/settings/search` digabung ke `/settings/keys` | Tenant tanpa kunci OpenRouter tersimpan di server akan gagal "kunci belum dikonfigurasi" — jumlahnya di pre-flight baris "Tenant bersitus tanpa kunci OpenRouter…"; sertakan di pengumuman. Pencarian yang dulu "meminjam" kunci Tavily/Brave tenant lain jatuh ke penyedia lain. |
| `localStorage` browser | `custom_openrouter_api_key` (**kunci OpenRouter plaintext**), `custom_openrouter_model`, `panitera_developer_mode`, `panitera_lab_main_tab`, `panitera_lab_engine_state`, `panitera_lab_tools_state` (input & hasil Lab terakhir), `wp_sidebar_collapsed`, `theme` | Hanya `theme` dan `wp_sidebar_collapsed` yang dipakai. Halaman **Pengaturan → Kunci API** menghapus `custom_openrouter_api_key` & `custom_openrouter_model` setiap kali dibuka. Mode pengembang kini disimpan di server (`notification_prefs`) | Kunci yang hanya ada di browser tidak lagi dipakai → isi ulang di Kunci API. Minta pengguna membuka halaman Kunci API sekali (membersihkan kunci plaintext lama). Salinan Lab & mode pengembang lama di browser diabaikan (tidak dihapus otomatis). |
| Webhook keluar | Header `X-Hub-Signature-256: sha256=HMAC(secret, body)` | `X-Panitera-Signature: sha256=HMAC(secret, "<timestamp>.<body>")` + `X-Panitera-Timestamp` | Belum ada penerima webhook → tidak ada tindakan. |
| Skema & RLS | 10 tabel ad-hoc, policy lama (termasuk `uploaded_media` dengan `user_id IS NULL` yang bocor lintas tenant), tanpa riwayat migrasi | 9 migrasi idempoten: tabel ke-11 `generation_checkpoints`; seluruh policy di 10 tabel diganti, RLS `force`; `GRANT` eksplisit (`anon` tanpa akses; sesi pengguna tidak bisa `UPDATE` `post_items` dan `INSERT` hanya kolom input; `agent_runs`/`uploaded_media`/`generation_checkpoints` baca saja); FK komposit anti lintas-tenant; CHECK baru; `user_id` NOT NULL; kolom lease/backoff & metrik run; RPC `claim_post_items`/`extend_post_item_lease`/`save_generation_checkpoint`; data fix (`failed_sync` tanpa naskah → `failed_generation`, kuota tool yang dihapus, normalisasi `retry_count` > 1000 & `max_concurrency` > 10, kategori per baris Tulis Terstruktur yang masih menunggu disalin ke `source_payload.requested_category_names`) | Pre-flight (§c), backup (§e), migrasi sebelum image. Baseline **tidak** mengubah tipe/nullability/default kolom yang sudah ada dan tidak menghapus tabel/kolom lama (`prompt_templates`, `encrypted_pexels_key`, …), kecuali drift yang ditemukan pre-flight & inventaris production 16 Okt 2026: `webhooks.events` `text[]` dikonversi ke `jsonb` (isi dipertahankan) dan `user_settings.id` ditambahkan (baseline); migrasi `20261018100000` menyamakan default & NOT NULL 50 kolom bawaan (baris NULL diisi default; mis. default `content_batches.status` `'completed'` → `'draft'`) dan menghapus 5 trigger `trg_*_updated_at` yang memanggil `handle_updated_at()` (duplikat `set_updated_at`; fungsinya dibiarkan untuk R1). |
| Realtime | Tidak dipakai (polling) | Broadcast privat dari trigger database ke topik `user:<uid>:…` + policy `panitera_receive_own_user_topics` di `realtime.messages`; `post_items`/`execution_logs` dikeluarkan dari publication `supabase_realtime` | Matikan "Allow public access to channels" (§g). Tanpa Realtime dasbor tetap jalan via polling. |
| Request ke WordPress | `fetch` langsung; IP literal privat ditolak; redirect diikuti | `wpFetch`/`safeFetch`: DNS di-pin, IP privat hasil resolve diblokir, request tulis (buat post) **tidak** mengikuti redirect; HTTPS wajib di production (sama seperti `main`) | Cek alamat situs (b.8). |
| Jadwal drip | Diproses cron per menit | Diproses runner; item yang slotnya sudah lewat dikirim `publish` saat diproses | Slot yang lewat selama jendela pemeliharaan langsung terbit setelah v2 berjalan (urut jatuh tempo, batas per situs). Sebutkan di pengumuman. |
| UI & sesi | Halaman di `src/app/*`, `/settings/search` | Route group `(auth)`/`(dashboard)`, `/login` tetap; `/settings/search` tidak ada lagi (pakai `/settings/keys`) | Cookie sesi Supabase SSR tidak diubah; bila sesi bermasalah cukup login ulang. |

---

## (b) Persiapan (H-1 s.d. sebelum jendela)

- [ ] **b.1** Tetapkan jendela pemeliharaan dan kirim pengumuman (teks i.1) minimal 24 jam sebelumnya.
- [ ] **b.2** Catat versi yang berjalan dan simpan image lama untuk rollback:
  ```bash
  cd <DEPLOY_DIR>
  git rev-parse HEAD                     # catat sebagai <MAIN_COMMIT>
  docker compose config --images         # nama image aplikasi, mis. wp-autopost-dashboard-panitera
  docker tag "$(docker inspect --format '{{.Image}}' panitera)" panitera-app:pre-v2
  docker image ls panitera-app           # pastikan tag pre-v2 ada
  ```
- [ ] **b.3** Salin `.env` lama: `mkdir -p ~/panitera-backups && chmod 700 ~/panitera-backups && cp .env ~/panitera-backups/env-pre-v2 && chmod 600 ~/panitera-backups/env-pre-v2`.
- [ ] **b.4** Pastikan format `ENCRYPTION_MASTER_KEY` diterima v2 tanpa mencetak nilainya: `grep -cE "^ENCRYPTION_MASTER_KEY=[\"']?[0-9a-fA-F]{64}[\"']?$" .env` → harus `1`. Bila `0`: **berhenti**. Jangan membuat kunci baru (semua kredensial tersimpan akan tak terbaca); `main` menerima kunci yang 64 karakter pertamanya hex, v2 menolak karakter tambahan — rapikan penulisan di `.env` tanpa mengubah 64 karakter hex-nya.
- [ ] **b.5** Siapkan mesin migrasi (panduan VPS §2): checkout `<V2_COMMIT>`, Node 22, Docker, `DB_URL` + `PGPASSWORD`; `npx --yes supabase@2.121.0 --version` → `2.121.0`.
- [ ] **b.6** Backup latihan H-1 (panduan VPS §10) — memastikan perintah dump berjalan; backup final tetap di e.1.
- [ ] **b.7** Jalankan pre-flight H-1 (§c). Setiap `GAGAL` diselesaikan sebelum hari H: perbaikan data diputuskan pemilik produk, didahului backup, dan dicatat (tabel apa, baris berapa, nilai lama/baru).
- [ ] **b.8** Periksa alamat situs WordPress. Daftar alamat (SQL Editor, tanpa data rahasia):
  ```sql
  select base_url, count(*) as situs from public.wp_sites group by 1 order by 1;
  ```
  Simpan kolom `base_url` ke `situs.txt`, lalu:
  ```bash
  while read -r u; do
    printf '%s -> ' "$u"
    curl -s -o /dev/null --max-time 15 -w '%{http_code} %{redirect_url}\n' "$u/wp-json/"
  done < situs.txt
  ```
  Harus `200` tanpa URL redirect. Redirect (mis. ke `www.`/trailing path) → alamat situs perlu diganti ke URL final setelah upgrade (hubungi tenant). Host yang resolve ke IP privat (`dig +short <host>`) akan diblokir v2.
- [ ] **b.9** Siapkan `.env` v2 (container yang berjalan tidak membaca ulang `.env` sampai di-*recreate*): tambah `SEARXNG_SECRET` (pertahankan nilai lama bila ada), `NEXT_PUBLIC_APP_URL=https://<DOMAIN>`, `OPENROUTER_SITE_URL=https://<DOMAIN>`, `HOST_PORT=127.0.0.1:3000` bila reverse proxy di host yang sama; biarkan `PLATFORM_KEY_ALLOWED=false`; hapus `QUEUE_CRON_LIMIT` & `WEBHOOK_SIGNATURE_SECRET` (opsional). Variabel Supabase & `ENCRYPTION_MASTER_KEY` **tidak diubah**. Rincian: panduan VPS §3.
- [ ] **b.10** (Opsional, memperpendek jendela) Build image v2 lebih dulu:
  ```bash
  cd <DEPLOY_DIR>
  git fetch && git checkout <V2_COMMIT>
  docker compose build panitera          # tidak me-recreate container yang sedang berjalan
  docker compose pull searxng-internal   # tag SearXNG yang dipin
  ```
  Setelah checkout ini `docker-compose.yml` tidak lagi mengenal service `queue-cron`; karena itu langkah §d memakai nama container (`docker stop panitera-cron`), bukan nama service.
- [ ] **b.11** Lihat drift skema (§c.4).
- [ ] **b.12** Siapkan akun uji + situs WordPress uji (kunci OpenRouter tersimpan di Kunci API) untuk smoke test berbasis **draft**.

---

## (c) Pre-flight & drift skema

- [ ] **c.1** SQL Editor Supabase (role `postgres`) → tempel **seluruh** `supabase/preflight/upgrade-v2.sql` → Run. Alternatif: `psql "$DB_URL" -f supabase/preflight/upgrade-v2.sql`. Skrip read-only (hanya fungsi `pg_temp`), aman dijalankan selama production berjalan.
- [ ] **c.2** Baca hasil (`pemeriksaan`, `status`, `jumlah`, `tindakan`):
  - `GAGAL` → migrasi akan gagal atau v2 tidak berjalan benar; **wajib 0** sebelum e.3. Kolom `tindakan` memuat perbaikan yang disarankan (mis. duplikat `wp_sites (user_id, base_url)`, rujukan lintas tenant, state di luar 9-state, nilai pelanggar CHECK, drift tipe fatal seperti `jsonb` tersimpan sebagai `json`).
  - `PERINGATAN` → putuskan & catat: item in-flight (wajar sebelum jendela), nullability berisi NULL, CHECK/trigger tak dikenal, tabel/view tanpa RLS di `public`, Realtime.
  - `INFO` → objek yang akan dibuat migrasi, data yang akan diubah migrasi, jumlah tenant tanpa kunci OpenRouter di server (untuk pemberitahuan).
- [ ] **c.3** Ekspor hasil (CSV) ke `~/panitera-backups/preflight-<tanggal>.csv` sebagai jejak audit.
- [ ] **c.4** Drift lengkap (butuh Docker, bisa beberapa menit):
  ```bash
  npx --yes supabase@2.121.0 link --project-ref <PROJECT_REF>
  npx --yes supabase@2.121.0 db diff --linked --schema public > ~/panitera-backups/diff-pre-v2.sql
  ```
  Diff sebelum migrasi panjang (memuat semua perubahan baseline). Cari khusus: `alter column … type` (bandingkan dengan baris "Drift tipe" pre-flight), tabel/fungsi/trigger/view yang tidak dikenal v2, dan ekstensi. Ulangi setelah migrasi (e.6): sisa diff = drift yang tidak dikonvergenkan baseline.

---

## (d) Jendela pemeliharaan: hentikan aplikasi lama

- [ ] **d.1** T0 — catat jam. Tutup akses pengguna di reverse proxy (halaman 503/pemeliharaan) agar tidak ada Tulis Cepat baru (`main` menjalankan job langsung di `after()`).
- [ ] **d.2** Hentikan sidecar cron: `docker stop panitera-cron`.
- [ ] **d.3** Tunggu job berjalan selesai; ulangi tiap 1–2 menit sampai kosong (batas tunggu ±15 menit):
  ```sql
  select state, count(*), min(updated_at) as tertua
  from public.post_items
  where state in ('generating_content', 'syncing_to_wp')
  group by 1;
  ```
- [ ] **d.4** Hentikan aplikasi lama: `docker stop -t 60 panitera`; pastikan `docker ps --filter name=panitera` kosong. Container lama **jangan dihapus** (dipakai R0).
- [ ] **d.5** Jalankan ulang query d.3 dan catat ID item yang tersisa. Item ini dipulihkan runner v2 ±15 menit setelah start (`generating_content` → antre ulang; `syncing_to_wp` → `failed_sync`, cek wp-admin sebelum "Kirim ulang").

---

## (e) Backup final & migrasi

- [ ] **e.1** Backup final (setelah aplikasi berhenti, sebelum migrasi):
  1. Dump lengkap (panduan VPS §10).
  2. Dump tabel aplikasi untuk rollback R1 (`pg_dump` versi 17 menangani server 15 & 17; versi klien tidak boleh lebih tua dari server):
     ```bash
     cd ~/panitera-backups
     docker run --rm -e PGPASSWORD -v "$PWD:/backup" postgres:17-alpine \
       pg_dump "$DB_URL" --format=custom --no-owner \
         --table=public.wp_sites --table=public.content_batches --table=public.post_items \
         --table=public.execution_logs --table=public.agent_profiles --table=public.agent_runs \
         --table=public.agent_skills --table=public.user_settings --table=public.webhooks \
         --table=public.uploaded_media \
         --file=/backup/app-tables-pre-v2.dump
     docker run --rm -v "$PWD:/backup" postgres:17-alpine \
       pg_restore --list /backup/app-tables-pre-v2.dump | grep -c 'TABLE DATA'   # = jumlah tabel yang ada (10)
     chmod 600 app-tables-pre-v2.dump
     ```
     Dump `--table` menyertakan indeks, constraint, trigger, policy, RLS, GRANT, dan data tabel tersebut, tetapi **tidak** view/fungsi. Bila pre-flight melaporkan view di `public`, tambahkan `--table=public.<view>`.
  3. Catat jumlah baris (pembanding setelah migrasi/rollback):
     ```sql
     select 'wp_sites' as tabel, count(*) from public.wp_sites
     union all select 'content_batches', count(*) from public.content_batches
     union all select 'post_items', count(*) from public.post_items
     union all select 'execution_logs', count(*) from public.execution_logs
     union all select 'agent_profiles', count(*) from public.agent_profiles
     union all select 'agent_runs', count(*) from public.agent_runs
     union all select 'agent_skills', count(*) from public.agent_skills
     union all select 'user_settings', count(*) from public.user_settings
     union all select 'webhooks', count(*) from public.webhooks
     union all select 'uploaded_media', count(*) from public.uploaded_media;
     ```
- [ ] **e.2** Pre-flight final (§c.1): `GAGAL` = 0.
- [ ] **e.3** Catat jam (T_migrasi), lalu terapkan migrasi — Opsi A (panduan VPS §5.1):
  ```bash
  npx --yes supabase@2.121.0 db push --linked --dry-run   # 9 berkas: 20261015090000 … 20261018100000
  npx --yes supabase@2.121.0 db push --linked
  ```
  atau Opsi B (SQL Editor/psql berurutan + `migration repair`, panduan VPS §5.2). Bila satu berkas gagal: berkas itu di-rollback, berkas sebelumnya tetap tercatat. Baca error (constraint/kolom yang disebut), putuskan perbaikan data bersama pemilik, lalu `db push` lagi; bila tidak selesai dalam jendela → R1 (§j).
- [ ] **e.4** `npx --yes supabase@2.121.0 migration list --linked` → Local = Remote untuk kesembilan versi.
- [ ] **e.5** Pre-flight ulang: tidak ada `GAGAL`; "Riwayat migrasi" `OK`; "Broadcast privat v2" `OK`; "Tabel aplikasi di publication" `OK`; baris data fix `OK`. Jumlah baris = e.1.3, kecuali `execution_logs` bertambah sebanyak log `data_fix` (= baris pre-flight "Data fix Fase 0: failed_sync tanpa naskah" sebelum migrasi).
- [ ] **e.6** (Opsional di dalam jendela) `db diff --linked --schema public > ~/panitera-backups/diff-post-v2.sql` untuk tindak lanjut migrasi lanjutan.
- [ ] **e.7** Skill sistem: `select slug from public.agent_skills where is_system;` memuat `anti-ai-editor`; bila tidak, jalankan `supabase/seed.sql` di SQL Editor (idempoten).

---

## (f) Deploy image v2 + env

- [ ] **f.1** `cd <DEPLOY_DIR> && git checkout <V2_COMMIT>` (lewati bila sudah di b.10).
- [ ] **f.2** Periksa `.env` final (b.9): `SEARXNG_SECRET` terisi, `NEXT_PUBLIC_APP_URL`, `OPENROUTER_SITE_URL`, `HOST_PORT`, `QUEUE_RUNNER` kosong/`embedded`, `PLATFORM_KEY_ALLOWED=false`; Supabase & `ENCRYPTION_MASTER_KEY` sama seperti `env-pre-v2`.
- [ ] **f.3** `docker compose build` (lewati bila b.10 dan `NEXT_PUBLIC_*` tidak berubah sejak itu).
- [ ] **f.4** `docker compose up -d --remove-orphans` (membuang container `panitera-cron`).
- [ ] **f.5** `docker compose ps` → `panitera` & `searxng-internal` healthy. `docker compose logs --tail=100 panitera` memuat `[queue-runner] Worker runner-… berjalan …` dan tidak ada `[env] … server dihentikan`; baca setiap `[PERINGATAN]`.
- [ ] **f.6** (Setelah upgrade dinyatakan stabil, bukan sekarang) `docker volume rm panitera_cron_logs` dan `docker image rm panitera-app:pre-v2`.

---

## (g) Pengaturan Supabase Dashboard

- [ ] **g.1** **Realtime → Settings**: matikan **Allow public access to channels** (panduan VPS §4.1).
- [ ] **g.2** **Authentication → URL Configuration**: **Site URL** = `https://<DOMAIN>` (panduan VPS §4.2).
- [ ] **g.3** Pre-flight: baris "Policy SELECT lain di realtime.messages" dan "Tabel aplikasi di publication" `OK`.

---

## (h) Smoke test (akses pengguna masih tertutup)

Akses dasbor hanya untuk operator: izinkan IP Anda di reverse proxy, atau `ssh -L 3000:127.0.0.1:3000 <vps>` lalu buka `http://localhost:3000` (alur koneksi WordPress jangan diuji lewat tunnel — origin callback berbeda).

- [ ] **h.1** `curl -fsS http://127.0.0.1:3000/api/health` → `"status":"ok"` dan `version` sesuai `package.json`.
- [ ] **h.2** Login akun uji → dasbor tampil tanpa error (bila sesi lama bermasalah: logout lalu login).
- [ ] **h.3** **Daftar Website**: situs lama tampil dengan status benar.
- [ ] **h.4** **Pengaturan → Kunci API**: kunci tersimpan berstatus terkonfigurasi; jalankan uji koneksi OpenRouter (membuktikan `ENCRYPTION_MASTER_KEY` mendekripsi kunci lama).
- [ ] **h.5** **Tulis Cepat** ke situs uji dengan target **Draft**: status bergerak `queued_input` → `generating_content` → `syncing_to_wp` → `saved_draft_on_wp` tanpa reload halaman (Realtime); draft muncul di wp-admin (membuktikan Application Password terdekripsi). Hapus draft uji setelahnya.
- [ ] **h.6** **Antrean**: item lama tampil; item hasil data fix berstatus `failed_generation` dengan log `data_fix`.
- [ ] **h.7** Item tersisa dari d.5: setelah ±15 menit sudah dipulihkan (tidak lagi in-flight tanpa lease).
- [ ] **h.8** Log `panitera` bersih ±10 menit; pre-flight terakhir tanpa `GAGAL`.
- [ ] **h.9** **Keputusan GO** oleh pemilik → buka akses pengguna (lepas halaman pemeliharaan) → kirim pengumuman i.2. Ini titik tanpa-kembali R1. Batas waktu: bila h.1–h.8 belum lulus pada **T0 + 60 menit**, jalankan R1 (§j).

---

## (i) Pemberitahuan ke pengguna

**i.1 — Pengumuman (H-1)**

> **Pemeliharaan Panitera: [hari, tanggal], pukul [jam mulai]–[jam selesai] WIB**
>
> Kami akan memperbarui Panitera ke versi baru yang lebih aman dan andal. Selama pemeliharaan (±90 menit) dasbor tidak dapat diakses dan antrean artikel dijeda sementara. Artikel yang sudah terjadwal tetap aman; jadwal yang terlewat selama pemeliharaan akan langsung diproses dan diterbitkan setelah layanan aktif kembali.
>
> Yang perlu Anda siapkan:
> 1. Pastikan kunci API OpenRouter Anda tersimpan di **Pengaturan → Kunci API**. Versi baru tidak lagi memakai kunci yang hanya tersimpan di browser.
> 2. Pastikan alamat website WordPress di Panitera adalah alamat final yang memakai HTTPS (mis. `https://www.domainanda.com`), tanpa pengalihan (redirect).
>
> Terima kasih atas pengertiannya.

**i.2 — Selesai**

> **Pemeliharaan Panitera selesai — layanan aktif kembali.**
>
> Yang baru:
> - Antrean artikel kini berjalan langsung di server dengan pemulihan otomatis, dan status artikel diperbarui secara langsung tanpa memuat ulang halaman.
> - Keamanan kunci API diperketat: semua kunci hanya disimpan terenkripsi di server.
>
> Mohon lakukan sekali:
> 1. Buka **Pengaturan → Kunci API**, pastikan kunci OpenRouter berstatus tersimpan, lalu simpan ulang bila diminta. Membuka halaman ini juga membersihkan salinan kunci lama di browser Anda.
> 2. Bila artikel gagal dengan pesan kunci OpenRouter belum dikonfigurasi, masukkan kunci Anda di halaman tersebut lalu pilih **Tulis ulang** pada artikel itu.
> 3. Artikel yang sebelumnya gagal tanpa naskah kini berstatus "gagal generasi" — gunakan **Tulis ulang**. Untuk artikel berstatus "gagal sinkronisasi", periksa dulu wp-admin sebelum **Kirim ulang** agar tidak terjadi duplikasi.
> 4. Bila ada masalah login, keluar lalu masuk kembali.
>
> Kendala lain? Balas pesan ini.

**i.3 — Bila rollback dilakukan**

> Pembaruan Panitera hari ini kami tunda karena kendala teknis; layanan kembali ke versi sebelumnya dan seluruh data Anda aman. Jadwal pembaruan berikutnya akan kami informasikan.

---

## (j) Rollback

### j.1 Apakah kode `main` berjalan di atas skema v2? (analisis statis, tidak diuji end-to-end)

| Jalur `main` | Di skema v2 |
| :--- | :--- |
| Baca data sesi (situs, antrean, log, pengaturan, Agent Profile, skill) | Berfungsi (policy SELECT pemilik). |
| Tulis Cepat & batch (`INSERT post_items` sesi) | Berfungsi: kolom yang diisi `main` termasuk GRANT kolom; policy insert `queued_input` terpenuhi. |
| CRUD situs/pengaturan/Agent Profile/skill/webhook, insert `execution_logs` | Berfungsi (GRANT tetap); nilai yang ditulis `main` lolos CHECK baru. |
| Worker `main` (Service Role) | Berfungsi; tidak mengisi lease, mengabaikan `next_attempt_at` dan checkpoint. |
| **"Kirim ulang" (`POST /api/posts/[id]`)** | **Berbahaya.** `UPDATE post_items` lewat sesi pengguna ditolak (`permission denied`, GRANT UPDATE dicabut); `main` tidak memeriksa error itu, tetap membuat post di WordPress, lalu gagal menulis status → item tetap `failed_sync`/`ready_to_sync` dan klik berikutnya membuat **posting ganda**. |
| Cache media `uploaded_media` tanpa `user_id` | Insert ditolak NOT NULL → deduplikasi media tidak tercatat (gambar dapat terunggah ganda). |
| Item `ready_to_sync` buatan v2 | Tidak pernah diproses cron `main`. |
| Auto-heal `main` | Mengembalikan `syncing_to_wp` > 10 menit ke antrean → generasi ulang & potensi posting ganda (perilaku lama). |

Kesimpulan: `main` tidak boleh dijalankan di atas skema v2 tanpa R1.

### j.2 Strategi per fase

| Fase | Kondisi | Strategi |
| :--- | :--- | :--- |
| Sebelum e.3 | Skema belum disentuh | **R0** — nyalakan lagi container lama. |
| e.3 s.d. h.9 | Migrasi sudah jalan, pengguna belum masuk | **R1** — restore tabel aplikasi dari `app-tables-pre-v2.dump` + image lama. Tidak ada data pengguna yang hilang (yang hilang hanya data smoke test & hasil data fix). Keputusan paling lambat T0 + 60 menit; eksekusi ±20–30 menit. |
| Setelah h.9 | Pengguna sudah menulis data lewat v2 | **Roll-forward** (perbaikan + build ulang, skema hanya maju lewat migrasi baru). R1 hanya atas keputusan pemilik: semua perubahan sejak e.1 hilang (artikel, antrean, situs, kunci baru), dan post yang sudah terkirim ke WordPress tidak lagi tercatat (risiko duplikat bila diantrekan ulang). **R2** hanya sebagai jalan darurat terakhir. |

### R0 — sebelum migrasi

```bash
docker start panitera && docker start panitera-cron   # container lama hanya di-stop di §d
```
Buka kembali akses di reverse proxy, kirim i.3. Bila sudah `git checkout <V2_COMMIT>`, kembalikan `git checkout <MAIN_COMMIT>` agar compose berikutnya sesuai container lama.

### R1 — restore tabel aplikasi + image lama (setelah migrasi, sebelum h.9)

Penghapusan objek v2 dan pemulihan tabel lama dijalankan dalam **satu transaksi** `psql`: bila pemulihan gagal di tengah jalan, penghapusan ikut dibatalkan dan database tetap dalam keadaan v2 (lanjutkan roll-forward). Prosedur ini diuji di Postgres 16 lokal, termasuk kasus pemulihan yang gagal.

1. Hentikan v2 dengan graceful shutdown: `docker compose stop panitera`; pastikan query d.3 kosong.
2. Simpan SQL penghapusan objek v2 sebagai `~/panitera-backups/rollback-v2-drop.sql`:
   ```sql
   drop policy if exists panitera_receive_own_user_topics on realtime.messages;
   drop table if exists
     public.generation_checkpoints, public.uploaded_media, public.webhooks, public.user_settings,
     public.agent_skills, public.agent_runs, public.agent_profiles, public.execution_logs,
     public.post_items, public.content_batches, public.wp_sites
     cascade;
   drop function if exists
     public.extend_post_item_lease(uuid, text, integer),
     public.save_generation_checkpoint(uuid, text, text, integer, jsonb, jsonb),
     public.broadcast_post_item_update(),
     public.broadcast_post_items_inserted(),
     public.broadcast_post_items_deleted(),
     public.broadcast_execution_log();
   delete from supabase_migrations.schema_migrations
   where version in ('20261015090000', '20261015090001', '20261015100000', '20261015110000',
                     '20261016090000', '20261017090000', '20261017100000', '20261018090000',
                     '20261018100000');
   ```
   `claim_post_items` ikut terhapus bersama `post_items` (bergantung pada tipe barisnya). `public.set_updated_at()` sengaja ditinggal: fungsi trigger tanpa hak eksekusi untuk role API, dan menghapusnya akan gagal bila production lama sudah memakai fungsi bernama sama. `cascade` juga menghapus view yang bergantung pada tabel ini — ikut dipulihkan hanya bila e.1 menyertakannya. Fungsi lama `public.handle_updated_at()` juga sengaja tidak dihapus (migrasi `20261018100000` hanya membuang triggernya), sehingga dump yang dipulihkan dapat membuat ulang trigger `trg_*_updated_at` lama.
3. Ubah dump menjadi SQL, lalu jalankan penghapusan + pemulihan dalam satu transaksi:
   ```bash
   cd ~/panitera-backups
   docker run --rm -v "$PWD:/backup" postgres:17-alpine \
     pg_restore --no-owner --file=/backup/app-tables-pre-v2.sql /backup/app-tables-pre-v2.dump
   docker run --rm -e PGPASSWORD -v "$PWD:/backup" postgres:17-alpine \
     psql "$DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
       -f /backup/rollback-v2-drop.sql -f /backup/app-tables-pre-v2.sql
   ```
   `app-tables-pre-v2.sql` berisi seluruh data tabel aplikasi (termasuk ciphertext kredensial): `chmod 600`, jangan disalin ke repo.
4. Verifikasi: jumlah baris = catatan e.1.3; pre-flight kembali seperti hasil e.2 (riwayat migrasi `INFO`, tabel `generation_checkpoints` belum ada); `npx --yes supabase@2.121.0 db push --linked --dry-run` kembali menampilkan kesembilan migrasi (upgrade dapat diulang).
5. Kembalikan aplikasi lama:
   ```bash
   cd <DEPLOY_DIR>
   git checkout <MAIN_COMMIT>
   cp ~/panitera-backups/env-pre-v2 .env
   docker tag panitera-app:pre-v2 wp-autopost-dashboard-panitera:latest   # nama dari b.2
   docker compose up -d --no-build --remove-orphans                       # membuat ulang panitera + panitera-cron
   ```
   Compose `main` menarik `searxng/searxng:latest` dan `alpine:latest` bila belum ada di host.
6. Setelan Realtime boleh tetap seperti §g (`main` tidak memakai Realtime). Smoke test singkat `main`, buka akses, kirim i.3, lalu analisis akar masalah sebelum menjadwalkan ulang.

Alternatif R1 bila project memakai add-on **PITR**: pulihkan project ke waktu tepat sebelum T_migrasi lewat Dashboard (Database → Backups; menu tidak diverifikasi), lalu langkah 5–6. PITR memulihkan seluruh database termasuk `auth`.

### R2 — darurat: image `main` di atas skema v2 (tidak diuji, tidak disarankan)

Hanya bila v2 tidak dapat dipakai, roll-forward butuh waktu lama, dan R1 tidak dapat diterima karena kehilangan data. Kembalikan hak UPDATE sesi pada `post_items` agar "Kirim ulang" versi `main` tidak menggandakan posting — ini menurunkan keamanan kembali ke level sebelum upgrade (tenant dapat mengubah state/naskah/`wp_post_id` itemnya sendiri):
```sql
grant update on table public.post_items to authenticated;
create policy post_items_update_own_legacy on public.post_items
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```
Lalu langkah R1.5 tanpa `cp .env`. Wajib dicabut sebelum kembali ke v2 (migrasi yang sudah tercatat tidak dijalankan ulang, jadi tidak membersihkannya):
```sql
drop policy if exists post_items_update_own_legacy on public.post_items;
revoke update on table public.post_items from authenticated;
```
Keterbatasan yang tetap ada: deduplikasi media `main` tidak tercatat dan item `ready_to_sync` buatan v2 tidak diproses otomatis.
