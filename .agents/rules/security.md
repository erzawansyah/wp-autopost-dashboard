# Aturan Keamanan Sistem & Multi-Tenant (`security.md`)

Karena `wp-autopost-dashboard` dirancang sebagai platform multi-user (SaaS) yang menyimpan akses publikasi ke website WordPress milik pengguna, setiap kode dan operasi Agent **WAJIB** mematuhi standar keamanan berikut.

---

## 1. Enkripsi Kredensial WordPress (Zero Plaintext Application Passwords)

- **DILARANG KERAS** menyimpan *WordPress Application Password* atau API Key milik pengguna dalam bentuk teks biasa (*plaintext*) di tabel database.
- Gunakan **AES-256-GCM** (melalui modul utilitas `src/lib/crypto.ts` dengan `ENCRYPTION_MASTER_KEY` dari environment variable server) atau **Supabase Vault (`pgsodium`)** sebelum menyimpan ke kolom `encrypted_app_password`.
- Kredensial **HANYA BOLEH** didekripsi di memori server (Next.js Server Action / Route Handler / Worker) sesaat sebelum melakukan panggilan HTTP ke WordPress, dan **TIDAK BOLEH** pernah dikembalikan dalam payload JSON ke browser/frontend.

---

## 2. Isolasi Data Multi-Tenant (Supabase RLS)

- Setiap tabel di skema `public` Supabase (`wp_sites`, `content_batches`, `post_items`, `execution_logs`, `user_api_keys`) **WAJIB** mengaktifkan Row Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).
- Buat policy eksplisit berbasis `auth.uid() = user_id` untuk `SELECT`, `INSERT`, `UPDATE`, dan `DELETE`.
- Penggunaan `SUPABASE_SERVICE_ROLE_KEY` (yang mem-bypass RLS) **hanya diizinkan** pada worker background / cron job terotorisasi, dan setiap query menggunakan Service Role wajib tetap menyertakan klausa filter eksplisit `.eq('user_id', ...)` atau `.eq('batch_id', ...)`.

---

## 3. Proteksi SSRF (Server-Side Request Forgery) pada Koneksi WordPress

Karena pengguna dapat memasukkan URL website WordPress mereka sendiri (`base_url`):
- **Validasi URL Ketat**: Sebelum server melakukan request ke `base_url` yang diinput pengguna, validasi bahwa:
  1. Protokol wajib `https://` (kecuali mode development lokal `NODE_ENV === 'development'`).
  2. Hostname **bukan** IP privat/internal (`127.0.0.1`, `localhost`, `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, atau metadata cloud `169.254.169.254`).
  3. Set batas waktu request (*timeout*, misal `15000ms`) dan batas ukuran response (*max body size*) agar website berbahaya tidak membuat server dashboard kehabisan memori.

---

## 4. Sanitasi Konten HTML & Pencegahan XSS

- Konten artikel yang dihasilkan oleh AI atau diimpor dari sumber luar (CSV / URL / RSS) harus melewati proses sanitasi HTML (menggunakan `sanitize-html` atau `DOMPurify`) sebelum ditampilkan di *preview* Dashboard maupun sebelum dikirim ke endpoint WordPress.
- Buang tag berbahaya seperti `<script>`, `<iframe>` yang tidak diizinkan, serta atribut event inline (`onerror`, `onload`, `onclick`).

---

## 5. Keamanan Webhook & Cron Endpoint

- Semua endpoint pemicu antrean (`/api/cron/*`, `/api/webhooks/*`, `/api/queue/process`) **WAJIB** memverifikasi tanda tangan kriptografi atau token rahasia (`CRON_SECRET` / `WEBHOOK_SIGNATURE`) menggunakan perbandingan waktu konstan (`crypto.timingSafeEqual`).

---

## 6. Aturan Keamanan untuk AI Agent di Workspace Ini

1. **Jangan Pernah Commit Secret**: File `.env`, `.env.local`, daftar kredensial situs nyata (`sites-credentials.json`), atau dump CSV berisi kredensial pengguna tidak boleh pernah ditulis ke file yang ter-track oleh Git.
2. **Konfirmasi Sebelum Push ke Situs Produksi**: Saat beroperasi dalam mode *Agentic Ops* (menjalankan script CLI langsung ke WordPress), Agent harus default ke `status: 'draft'` kecuali pengguna secara eksplisit memerintahkan `publish` atau `future`.
