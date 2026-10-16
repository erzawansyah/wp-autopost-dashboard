# Deploy & Operasi Panitera di VPS (Docker Compose)

Panduan operator untuk menjalankan Panitera (branch `v2`) di satu VPS dengan Docker Compose dan database Supabase Cloud. Upgrade satu kali dari production lama (`main`) punya runbook sendiri: [`upgrade-ke-v2.md`](upgrade-ke-v2.md).

Konvensi: `<PROJECT_REF>`, `<POOLER_HOST>`, `<DOMAIN>`, `<COMMIT_ATAU_TAG>` adalah placeholder. Jangan pernah menulis nilai aslinya (apalagi password/kunci) ke berkas yang di-track Git, worklog, atau tiket.

---

## 1. Gambaran Deploy

| Komponen | Sumber | Catatan |
| :--- | :--- | :--- |
| `panitera` | `Dockerfile` (Node 22 Alpine, Next.js 16 standalone) | Dasbor + API + **runner antrean tertanam** (`QUEUE_RUNNER=embedded`): klaim RPC `claim_post_items`, lease + heartbeat, batas paralel per situs, retry/backoff, auto-healing. Tidak ada sidecar cron. |
| `searxng-internal` | image `searxng/searxng` (tag dipin di `docker-compose.yml`) | Hanya `expose: 8080` di jaringan Docker internal; tidak dipublikasikan ke host. |
| Supabase Cloud | project Anda | PostgreSQL (skema dari `supabase/migrations/`), Auth, Realtime (Broadcast privat untuk status antrean live). |

Tidak ada volume data di container: seluruh state ada di Supabase. Yang wajib dijaga di VPS hanya berkas `.env` (lihat §10).

> **Supabase self-hosted:** panduan ini memakai fitur Supabase Cloud (Dashboard, `supabase link`, pooler). Pada self-hosted gunakan `--db-url` ke Postgres Anda untuk semua perintah CLI, pastikan Postgres ≥ 15 dan layanan Realtime (skema `realtime`) tersedia, lalu atur "public access" Realtime lewat konfigurasi tenant Realtime — langkah self-hosted tidak diverifikasi di repo ini.

---

## 2. Prasyarat

**VPS**
- Linux dengan Docker Engine + plugin Compose v2 (`docker compose version`).
- RAM cukup untuk `next build` di dalam Docker; bila VPS kecil, tambahkan swap atau build image di mesin lain.
- Akses keluar ke registry npm & Docker Hub (build/pull), Supabase, OpenRouter, dan situs WordPress pengguna.
- Reverse proxy TLS (Caddy/Nginx/Traefik) untuk `<DOMAIN>` → `127.0.0.1:3000`. Proxy wajib meneruskan `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, dan `X-Forwarded-For` (dipakai untuk origin callback WordPress dan rate limit tanpa sesi).

**Mesin untuk migrasi database** (boleh VPS, laptop, atau CI)
- Checkout repo pada commit yang akan dideploy (`supabase/migrations/`, `supabase/config.toml`, `supabase/preflight/`).
- Node.js 22 untuk `npx --yes supabase@2.121.0 …` — versi yang sama dengan `package-lock.json` dan suite e2e (`npx --no-install supabase`). Bila CLI di lock dinaikkan, ikuti versinya (`npm ls supabase`).
- Docker hanya untuk `supabase db diff` dan `supabase db dump` (CLI menjalankan shadow DB/`pg_dump` di container). `db push`, `migration list`, dan `migration repair` tidak butuh Docker.

**Supabase**
- Project ref, password database, publishable key (`sb_publishable_…`, atau anon key lama), dan secret key (`sb_secret_…`, atau service role key lama).
- PostgreSQL ≥ 15 (baseline memakai FK `on delete set null (kolom)`); pre-flight memeriksanya.

**Koneksi database** (untuk CLI, `psql`, `pg_dump`)
- Salin parameter dari Dashboard → tombol **Connect**. Dari VPS tanpa IPv6 pakai **Session pooler** (port 5432; user `postgres.<PROJECT_REF>`). Jangan memakai transaction pooler (port 6543) untuk migrasi, pre-flight, maupun dump.
- Simpan password di variabel `PGPASSWORD` (dibaca `psql`/`pg_dump` dan juga oleh Supabase CLI bila URL tidak memuat password — diuji dengan CLI 2.121.0), bukan di dalam URL, agar tidak masuk riwayat shell/daftar proses dan tidak perlu *percent-encoding*:
  ```bash
  read -rs PGPASSWORD && export PGPASSWORD
  export DB_URL="postgresql://postgres.<PROJECT_REF>@<POOLER_HOST>:5432/postgres"
  ```

---

## 3. Konfigurasi `.env`

Docker Compose membaca `.env` di folder yang sama dengan `docker-compose.yml` untuk **interpolasi** `${VAR}` (bukan `env_file`); hanya variabel yang tercantum di blok `environment:` service `panitera` yang masuk ke container. Mulai dari `.env.example`:

```bash
cp .env.example .env && chmod 600 .env
```

Server memvalidasi env saat start (`src/instrumentation.ts` → `src/lib/env/server.ts`). Di production, variabel **wajib** yang kosong/tidak valid membuat proses keluar dengan log `[env] Konfigurasi environment server tidak valid (production); server dihentikan.` beserta **nama** variabelnya (nilai tidak pernah dicetak) — container lalu restart berulang (`restart: unless-stopped`).

### 3.1 Wajib

| Variabel | Dibaca saat | Keterangan |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | **build** (build arg) | URL project, mis. `https://<PROJECT_REF>.supabase.co`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` *atau* `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **build** (build arg) | Kunci publik untuk Auth SSR & Realtime di browser. Compose mengisi yang kosong dengan yang lain. |
| `SUPABASE_SECRET_KEY` *atau* `SUPABASE_SERVICE_ROLE_KEY` | runtime | Service Role (bypass RLS) — hanya dipakai runner antrean & proses sistem. Tanpa ini runner tidak berjalan. |
| `ENCRYPTION_MASTER_KEY` | runtime | Tepat 64 karakter hex (`^[0-9a-fA-F]{64}$`). Mengenkripsi Application Password WordPress & kunci BYOK (AES-256-GCM) serta menandatangani state token koneksi WordPress. **Jangan pernah diganti** pada database yang sudah berisi data: semua kredensial tersimpan menjadi tidak terbaca. Simpan salinannya di password manager. |
| `SEARXNG_SECRET` | compose (service `searxng-internal`) | String acak panjang (`openssl rand -hex 32`). Tanpa nilai ini `docker compose` menolak berjalan: `required variable SEARXNG_SECRET is missing a value`. |

> **`NEXT_PUBLIC_*` ditanam saat build.** Next.js mengganti `process.env.NEXT_PUBLIC_…` dengan nilai yang ada saat `next build` (di client **dan** server). `docker-compose.yml` meneruskan `NEXT_PUBLIC_SUPABASE_URL` dan kunci publik sebagai build arg, jadi mengubahnya di `.env` **wajib** diikuti `docker compose build` — restart saja tidak cukup.

### 3.2 Sangat disarankan

| Variabel | Default | Keterangan |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | kosong | URL publik dasbor (`https://<DOMAIN>`): tujuan callback otorisasi Application Password WordPress. Kosong → origin diambil dari `X-Forwarded-Host`/`Host` (start memberi peringatan). Variabel ini hanya dibaca kode server dan **tidak** diteruskan sebagai build arg, sehingga dibaca saat runtime — cukup `docker compose up -d` setelah diubah. Jangan menjadikannya build arg (nilainya akan dibekukan di image). |
| `HOST_PORT` | `3000` | Port host untuk container. Di belakang reverse proxy pada host yang sama isi `127.0.0.1:3000` agar port 3000 tidak terbuka ke internet (port yang dipublikasikan Docker melewati aturan firewall seperti `ufw`). |
| `OPENROUTER_SITE_URL` | `http://localhost:3000` | Header `HTTP-Referer` ke OpenRouter; isi `https://<DOMAIN>`. |

### 3.3 Opsional

| Variabel | Default | Keterangan |
| :--- | :--- | :--- |
| `QUEUE_RUNNER` | `embedded` (production) | `off` = tanpa runner di proses ini; antrean hanya bergerak lewat `POST /api/queue/process` dari cron eksternal (1 item per pemicu). Nilai lain → gagal start. |
| `CRON_SECRET` | kosong | Wajib bila `QUEUE_RUNNER=off` (disarankan ≥ 32 karakter). Hanya diterima lewat header `Authorization: Bearer …` atau `x-cron-secret`; query string `?secret=` ditolak. |
| `QUEUE_CONCURRENCY` | `3` | Job paralel per proses (1–10). Batas per situs tetap `wp_sites.max_concurrency` (default 2, maks 10). |
| `QUEUE_POLL_INTERVAL_MS` | `5000` | Jeda polling saat idle (1000–600000). Enqueue membangunkan runner seketika. |
| `QUEUE_LEASE_SECONDS` | `900` | Lease item in-flight (60–3600), diperpanjang heartbeat; lease kedaluwarsa dipulihkan auto-healing. |
| `OPENROUTER_APP_NAME` | `Panitera` | Header `X-Title` ke OpenRouter. |
| `OPENROUTER_DEFAULT_MODEL` / `DEFAULT_AI_MODEL` | bawaan aplikasi | Model default runtime Agent Profile / WP Tools. |
| `SEARXNG_URL` | `http://searxng-internal:8080` | SearXNG platform; hanya `/search` & `/autocompleter` di origin ini yang dipercaya server. |
| `PLATFORM_KEY_ALLOWED` | `false` | BYOK-only. Hanya `"true"` persis yang mengaktifkan kunci platform `OPENROUTER_API_KEY` / `PEXAFY_API_KEY` sebagai cadangan kunci tenant (biaya ditanggung operator). Kunci yang diisi saat flag mati diabaikan (peringatan saat start). |
| `LANGSMITH_TRACING` | kosong | `"false"` mematikan seluruh tracing LangSmith, termasuk BYOK tenant. |

Nilai di luar rentang pada variabel `QUEUE_*` memakai default dan memunculkan peringatan saat start.

Variabel di `.env.example` yang **tidak** diteruskan `docker-compose.yml`: `BING_SEARCH_API_KEY`/`BING_API_KEY` (kunci platform), `LANGCHAIN_TRACING_V2`, dan `ALLOW_PRIVATE_NETWORK_FETCH` (khusus dev; diabaikan di production). Tambahkan ke blok `environment:` hanya bila memang dibutuhkan. `NEXT_PUBLIC_APP_VERSION` diisi otomatis dari `package.json`.

Variabel lama yang **tidak dipakai lagi** di v2: `WEBHOOK_SIGNATURE_SECRET` (webhook ditandatangani secret per webhook) dan `QUEUE_CRON_LIMIT` (sidecar cron dihapus). Boleh dihapus dari `.env`.

---

## 4. Pengaturan Supabase Dashboard

### 4.1 Realtime: hanya kanal privat

Status antrean & log live dikirim trigger database lewat `realtime.send(…, private => true)` ke topik `user:<uid>:queue` dan `user:<uid>:post:<post_item_id>` (migrasi `20261017100000_realtime_broadcast.sql`). Join topik diotorisasi policy `panitera_receive_own_user_topics` pada `realtime.messages` (hanya topik berawalan `user:<auth.uid()>:`); dasbor selalu join dengan `{ config: { private: true } }` dan jatuh ke polling bila kanal gagal.

Langkah (setelah migrasi diterapkan):
1. Buka **Realtime → Settings** project (`https://supabase.com/dashboard/project/<PROJECT_REF>/realtime/settings`).
2. Matikan **Allow public access to channels** (dokumen *Realtime Authorization* menyebutnya "Allow public access"), lalu simpan.

Dampak (menurut dokumen Supabase *Realtime Settings*, *Realtime Authorization*, dan *Broadcast*, diperiksa 16 Okt 2026; letak menu di Dashboard dapat berubah):
- Setiap join kanal diperiksa terhadap RLS `realtime.messages`; klien yang tidak memakai `config.private: true` ditolak (`PrivateOnly`). Dasbor v2 tidak terdampak; kanal publik tanpa otorisasi (siapa pun yang memegang publishable key) tidak bisa dipakai lagi.
- Isi pesan antrean tetap privat walau setelan ini menyala, karena broadcast privat hanya sampai ke kanal privat yang lolos policy. Mematikan akses publik adalah pengerasan yang disyaratkan header migrasi realtime.
- Policy permissive digabung OR: jangan menambah policy SELECT longgar (mis. `using (true)`) di `realtime.messages`. Pre-flight baris "Policy SELECT lain di realtime.messages" memeriksanya.
- Postgres Changes tidak dipakai lagi: migrasi mengeluarkan `post_items` & `execution_logs` dari publication `supabase_realtime` (event DELETE Postgres Changes tidak melewati RLS). Jangan menambahkan tabel aplikasi ke publication lewat **Database → Publications**.

### 4.2 Auth: URL Configuration

Registrasi memanggil `supabase.auth.signUp` tanpa `emailRedirectTo`, sehingga tautan email konfirmasi (bila **Confirm email** aktif) kembali ke **Site URL**. Di **Authentication → URL Configuration** isi **Site URL** dengan `https://<DOMAIN>` (bukan `http://localhost:3000`). Redirect URL tambahan tidak dibutuhkan alur v2. Perilaku ini sama dengan `main`. (Nama menu tidak diverifikasi ulang.)

### 4.3 Data API

Skema `public` harus tetap ter-*expose* (default). Migrasi menyatakan `GRANT` secara eksplisit, jadi setelan auto-expose tabel baru tidak berpengaruh. Jangan menambah GRANT ke `anon`: aplikasi tidak memakainya.

---

## 5. Migrasi Database

Sumber kebenaran skema: `supabase/migrations/*.sql` (berurutan; idempoten). Aturan:
- Migrasi selalu diterapkan **sebelum** image baru dijalankan (kode v2 membutuhkan kolom/RPC baru).
- Berkas migrasi yang sudah diterapkan tidak boleh diedit — buat migrasi baru (skill `panitera-db-migration`).
- Seed (`supabase/seed.sql`) tidak ikut `db push`.

### 5.1 Opsi A — Supabase CLI (disarankan)

```bash
npx --yes supabase@2.121.0 login                              # access token (atau env SUPABASE_ACCESS_TOKEN)
npx --yes supabase@2.121.0 link --project-ref <PROJECT_REF>   # meminta password DB (atau env SUPABASE_DB_PASSWORD)
npx --yes supabase@2.121.0 migration list --linked            # kolom Remote kosong = belum diterapkan
npx --yes supabase@2.121.0 db push --linked --dry-run         # daftar migrasi yang akan diterapkan
npx --yes supabase@2.121.0 db push --linked
npx --yes supabase@2.121.0 migration list --linked            # Local = Remote untuk semua versi
```

Tanpa `login`/`link`, ganti `--linked` dengan `--db-url "$DB_URL"` (password dari `PGPASSWORD`, §2) pada `migration list`, `db push`, dan `migration repair`.

Perilaku `db push` (diuji dengan CLI 2.121.0 terhadap Postgres lokal berskema lama): tabel riwayat `supabase_migrations.schema_migrations` dibuat bila belum ada; setiap berkas dijalankan dalam transaksinya sendiri dan dicatat bersama. Bila satu berkas gagal, berkas itu di-rollback utuh, berkas sebelumnya tetap tercatat, dan berkas sesudahnya tidak dijalankan. Perbaiki penyebabnya lalu jalankan `db push` lagi — hanya sisa migrasi yang diterapkan.

### 5.2 Opsi B — SQL Editor / psql + `migration repair`

Untuk saat CLI tidak dapat terhubung (mis. hanya akses Dashboard):
1. Jalankan setiap berkas `supabase/migrations/*.sql` **berurutan** (urut nama), masing-masing dalam satu transaksi:
   - SQL Editor: tempel `begin;`, isi berkas, lalu `commit;` dalam satu eksekusi;
   - atau psql: `psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/<berkas>.sql`.
2. Setelah **semua** berhasil, samakan riwayat CLI:
   ```bash
   npx --yes supabase@2.121.0 migration repair --status applied \
     20261015090000 20261015090001 20261015100000 20261015110000 \
     20261016090000 20261017090000 20261017100000 20261018090000 20261018100000 --db-url "$DB_URL"
   npx --yes supabase@2.121.0 db push --dry-run --db-url "$DB_URL"   # harus: Remote database is up to date.
   ```
`migration repair` hanya menulis riwayat (membuat tabel riwayat bila belum ada), tidak menjalankan SQL: jangan pernah menandai `applied` untuk berkas yang belum benar-benar dijalankan. Alur ini juga diuji dengan CLI 2.121.0.

### 5.3 Verifikasi

- Jalankan ulang pre-flight `supabase/preflight/upgrade-v2.sql` (read-only, aman kapan saja; cara pakai di header berkas): tidak boleh ada `GAGAL`; baris "Riwayat migrasi" `OK`; baris "Broadcast privat v2" `OK` (5/5).
- `npx --yes supabase@2.121.0 db diff --linked --schema public` (butuh Docker) menampilkan perbedaan skema project terhadap hasil migrasi. Sisa diff yang wajar setelah upgrade dari skema lama: nullability/default kolom lama dan kolom/tabel lama yang tidak dipakai (baseline sengaja tidak mengubahnya) — tindak lanjuti lewat migrasi baru yang disepakati.
- Skill sistem `anti-ai-editor` (default Deep Agent): `select slug from public.agent_skills where is_system;`. Bila belum ada, jalankan `supabase/seed.sql` di SQL Editor (idempoten; tidak menimpa konten yang sudah ada).

---

## 6. Build & Start

```bash
git fetch --tags && git checkout <COMMIT_ATAU_TAG>
docker compose build                       # NEXT_PUBLIC_* dari .env menjadi build arg
docker compose up -d --remove-orphans      # --remove-orphans membuang container service yang sudah dihapus
docker compose ps                          # panitera & searxng-internal: running (healthy)
```

Healthcheck:
- `docker-compose.yml` mendefinisikan healthcheck `GET http://127.0.0.1:3000/api/health` setiap 30 detik (start period 30 detik, 3 kali gagal → `unhealthy`); definisi ini menimpa `HEALTHCHECK` di `Dockerfile`.
- Manual: `curl -fsS http://127.0.0.1:3000/api/health` → `{"ok":true,"status":"ok","version":"v<versi>","uptime":…,"timestamp":"…"}`.
- `/api/health` hanya *liveness* proses: tidak memeriksa database maupun runner. Pastikan juga log start memuat `[queue-runner] Worker runner-… berjalan di host … (pid …)` dan tidak ada baris `[env] …`.

---

## 7. Graceful Shutdown Runner

`docker compose stop|down|up` (recreate) mengirim SIGTERM lalu menunggu `stop_grace_period: 40s` sebelum SIGKILL. Saat SIGTERM, runner (tenggat total 30 detik, `src/server/queue/embedded.ts` + `shutdown.ts`):
1. berhenti mengklaim item baru;
2. menunggu job yang sedang berjalan;
3. saat tenggat habis, mencabut klaim yang belum selesai: item yang **belum** mengirim request ke WordPress kembali ke antrean (melanjutkan dari checkpoint `pre_resolve`/`draft` tanpa memanggil LLM untuk langkah yang sudah selesai); item yang **sudah** mengirim request menjadi `failed_sync` (post mungkin sudah terbuat — cek wp-admin sebelum "Kirim ulang");
4. baru kemudian server HTTP Next.js ditutup.

Jangan memakai `docker kill`, `docker stop -t 0`, atau menurunkan `stop_grace_period` di bawah ±35 detik. Bila proses tetap mati paksa, lease item dipulihkan auto-healing setelah kedaluwarsa (`QUEUE_LEASE_SECONDS`, default 15 menit).

---

## 8. Deploy Rutin Berikutnya

Urutan baku:
1. Baca diff rilis: ada migrasi baru (`supabase/migrations/`)? ada variabel env baru (`.env.example`, `src/lib/env/server.ts`)?
2. Bila ada migrasi: backup (§10), lalu `db push --dry-run` → `db push` (§5). Migrasi harus **kompatibel mundur** dengan image yang sedang berjalan (menambah kolom/tabel/indeks, bukan menghapus/mengganti nama). Perubahan destruktif dipecah menjadi dua rilis (rilis 1 berhenti memakai objek lama, rilis 2 menghapusnya) atau dijalankan dengan jendela pemeliharaan seperti upgrade v2.
3. `docker compose build` (container lama tetap melayani selama build).
4. `docker compose up -d --remove-orphans` — downtime hanya saat container diganti (shutdown ≤ 40 detik + start). Bila memungkinkan pilih saat antrean sepi (cek item `generating_content`/`syncing_to_wp`, §9).
5. Verifikasi: `docker compose ps`, `/api/health`, log runner, satu Tulis Cepat ke situs uji dengan target **draft**.

Catatan:
- Ubah `NEXT_PUBLIC_*` → wajib langkah 3–4. Ubah variabel runtime lain → `docker compose up -d` (me-*recreate* container). `docker compose restart` **tidak** membaca ulang `.env`.
- Image SearXNG dipin; perbarui tag di `docker-compose.yml` (PR Dependabot), lalu `docker compose pull searxng-internal && docker compose up -d`.
- Rollback rilis rutin: checkout commit sebelumnya lalu build & up. Aman selama migrasi rilis tersebut kompatibel mundur (aturan langkah 2).

---

## 9. Log & Troubleshooting

```bash
docker compose logs -f --tail=200 panitera
docker compose logs --tail=100 searxng-internal
docker inspect --format '{{json .State.Health}}' panitera
```

| Gejala | Penyebab umum | Tindakan |
| :--- | :--- | :--- |
| Container restart berulang; log `[env] Konfigurasi environment server tidak valid` | Variabel wajib kosong/tidak valid | Perbaiki variabel yang disebut log, `docker compose up -d`. |
| `docker compose up` gagal `required variable SEARXNG_SECRET is missing a value` | `SEARXNG_SECRET` kosong | Isi string acak (§3.1). |
| Antrean tidak bergerak | `QUEUE_RUNNER=off` (log `[queue-runner] QUEUE_RUNNER=off…`), secret key Supabase kosong (log `[queue-runner] Runner antrean tidak dijalankan…`), atau migrasi belum diterapkan (RPC `claim_post_items` tidak ditemukan) | Periksa env & `migration list`. |
| Item tertahan `generating_content`/`syncing_to_wp` | Proses mati paksa / heartbeat berhenti | Tunggu auto-healing (lease kedaluwarsa; default 15 menit). `syncing_to_wp` tanpa `wp_post_id` menjadi `failed_sync`: cek wp-admin sebelum "Kirim ulang". |
| Status antrean tidak live (berubah hanya saat polling) | Realtime gagal join / objek Broadcast belum ada | Jalankan pre-flight (baris Realtime), cek §4.1. Dasbor tetap berfungsi lewat polling. |
| Callback koneksi WordPress kembali ke origin salah | `NEXT_PUBLIC_APP_URL` kosong & proxy tidak meneruskan `X-Forwarded-*` | Isi `NEXT_PUBLIC_APP_URL=https://<DOMAIN>`. |
| "Request ke WordPress diblokir proteksi keamanan (alamat privat/lokal atau redirect)" | `base_url` situs mengalami redirect (request tulis tidak mengikuti redirect) atau host resolve ke IP privat | Ubah alamat situs ke URL HTTPS publik final (mis. `https://www.domain.com`). |
| Artikel gagal karena kunci OpenRouter belum dikonfigurasi | BYOK-only | Pengguna mengisi kunci di **Pengaturan → Kunci API** (`/settings/keys`). |
| Password WordPress/kunci API tidak bisa didekripsi setelah deploy | `ENCRYPTION_MASTER_KEY` berbeda dari sebelumnya | Kembalikan nilai lama dari backup `.env`. |
| `NEXT_PUBLIC_*` baru tidak berlaku | Nilai tertanam di image | `docker compose build && docker compose up -d`. |

Query bantu (SQL Editor):
```sql
-- Ringkasan antrean
select state, count(*) from public.post_items group by 1 order by 1;
-- Item in-flight beserta lease
select id, state, locked_by, locked_until, updated_at from public.post_items
where state in ('generating_content', 'syncing_to_wp') order by updated_at;
-- Log terbaru satu item
select created_at, step, level, message from public.execution_logs
where post_item_id = '<POST_ITEM_ID>' order by created_at desc limit 50;
```

---

## 10. Backup & Pemulihan

**Yang wajib di-backup**
1. **Database Supabase.** Backup otomatis Dashboard (daily backup / PITR) bergantung pada plan; jangan jadikan satu-satunya backup. Ambil dump logis sendiri secara berkala dan **selalu** sebelum migrasi:
   ```bash
   mkdir -p ~/panitera-backups && chmod 700 ~/panitera-backups && cd ~/panitera-backups
   STAMP=$(date +%Y%m%d-%H%M)
   npx --yes supabase@2.121.0 db dump --db-url "$DB_URL" -f roles-$STAMP.sql --role-only
   npx --yes supabase@2.121.0 db dump --db-url "$DB_URL" -f schema-$STAMP.sql
   npx --yes supabase@2.121.0 db dump --db-url "$DB_URL" -f data-$STAMP.sql --use-copy --data-only
   chmod 600 ./*.sql
   ```
   `db dump` menjalankan `pg_dump` di container (butuh Docker). Dump skema tidak memuat skema internal Supabase (`auth`, `storage`, `realtime`, …), sedangkan dump data memuat data `auth` (hash password pengguna) dan ciphertext kredensial.
2. **`.env`**, terutama `ENCRYPTION_MASTER_KEY`. Tanpa kunci ini seluruh Application Password WordPress dan kunci BYOK di database tidak dapat dipakai lagi (pengguna harus menyambungkan ulang situs & mengisi ulang kunci). Simpan di password manager, terpisah dari dump database.

Simpan backup **di luar folder repo** (build context Docker menyalin seluruh folder repo ke stage builder) dan salin ke penyimpanan di luar VPS. Perlakukan berkas dump sebagai rahasia.

**Pemulihan ke project Supabase baru** (dump CLI di atas; ikuti panduan resmi Supabase *Backup and Restore using the CLI*):
```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles-<STAMP>.sql --file schema-<STAMP>.sql \
  --command 'SET session_replication_role = replica' \
  --file data-<STAMP>.sql --dbname "$NEW_DB_URL"
```
Dump skema CLI tidak memuat skema `realtime` maupun riwayat `supabase_migrations`, jadi setelahnya: jalankan ulang `supabase/migrations/20261017100000_realtime_broadcast.sql` (idempoten; memasang lagi policy topik privat), catat riwayat migrasi dengan `migration repair --status applied <versi…>` (§5.2), jalankan pre-flight, atur §4, ganti `NEXT_PUBLIC_SUPABASE_*` dan secret key di `.env`, lalu **build ulang** image. Pemulihan di tempat (project yang sama) sesaat setelah migrasi dijelaskan di [`upgrade-ke-v2.md` §(j)](upgrade-ke-v2.md#j-rollback).
