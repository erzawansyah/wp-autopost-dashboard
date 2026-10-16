# DESIGN.md — Design System & UI/UX Specification

> **Spesifikasi & Konvensi**: Sesuai standar **Google Stitch**, **TypeUI**, dan framework inteligensi desain **`ui-ux-pro-max`** (NextLevelBuilder).  
> Dokumen ini adalah _Single Source of Truth_ untuk seluruh keputusan visual, token warna, tipografi, komponen interaktif, dan tata kelola antarmuka platform **WP Autopost & Multi-Site Content Dashboard**.

---

## 1. Design Dials (Sistem Parameter)

Sesuai kalibrasi dial sistem dari `ui-ux-pro-max`:

- **Variance: 6/10 (Balanced / Modern)** — Memadukan kejelasan struktur kisi modular ala Trello dengan ketegasan visual Microsoft Fluent.
- **Motion: 4/10 (Standard / Purpose-Driven)** — Transisi mikro halus (150–300ms) untuk hover dan perpindahan status batch tanpa animasi berlebih (_no gratuitous motion_).
- **Density: 8/10 (Dense / Dashboard)** — Kepadatan informasi tinggi (_data-dense_) yang optimal untuk memantau puluhan antrean artikel dan metrik multi-situs tanpa membuang ruang layar, namun tetap terstruktur rapi.

---

## 2. Pattern (Pola Arsitektur UX & Tata Letak)

- **Nama Pola**: _Operations Hub & Multi-Site Workflow_
- **Inspirasi Sistem**:
  - **Trello Workspace**: Kanvas kerja yang nyaman dipindai (_scan-friendly_), kartu tugas terisolasi rapi, dan indikator status visual instan.
  - **Microsoft Fluent Design**: Kejelasan hirarki visual, elevasi lapisan (_dimensional layering_) bertingkat 1px yang presisi, dan rasa keteraturan tinggi.
- **Struktur Halaman Utama** (shell `DashboardShell`, dirender sekali oleh `src/app/(dashboard)/layout.tsx`):
  1. **Sidebar** (`sidebar-nav`): navigasi menu (Dashboard, Daftar Website, Daftar Batch, Antrean, Tulis Cepat/Massal/Terstruktur, WP Tools, Profil Agen, Skill Registry, Laboratorium bila Developer Mode, Pengaturan, Help/Docs); dapat diciutkan.
  2. **Top Bar** (`top-navbar`): breadcrumb (label = `metadata.title` halaman, induk logis per rute; peta di
     `src/lib/navigation/breadcrumbs.ts` — halaman dasbor baru wajib didaftarkan), toggle Light/Dark (`ModeToggle`), dan menu akun (Kelola Website dengan jumlah situs, Keluar).
  3. **Quick Telemetry**: kartu KPI di Dashboard Overview (`kpi-summary-grid`: Sudah Terbit, Sedang Diproses, Draf & Terjadwal, Perlu Tindakan).
  4. **Main Content Canvas**: tabel data padat (@tanstack/react-table, `queue-data-table`) dengan pengelompokan per batch, _multi-select_, filter status/situs/batch, dan pencarian. Tampilan Kanban belum diimplementasikan.
  5. **Bilah Aksi Massal** (`QueueBulkBar`): muncul di atas tabel saat baris dipilih (proses ulang, hapus). Pilihan eksekusi langsung vs. jadwal bertahap ada di form Tulis Massal (`ScheduleStrategyPicker`).

---

## 3. Style & Karakter Visual (_Brand Vibe_)

- **Nama Gaya**: _Authoritative Precision Publishing (Fluent-Trello Adaptation)_
- **Mode Dukungan**: **Light Mode (Primary Default)** + **Dark Mode (Full Support)**.
  - _Light Mode_: Latar kanvas abu-abu slate lembut (`#F4F5F7`), kartu putih bersih (`#FFFFFF`), border presisi (`#E2E8F0`), kontras teks tinggi (`#0F172A`).
  - _Dark Mode_: Latar kanvas obsidian midnight (`#0B0F19`), kartu berlapispelan (`#151C2C`), border slate (`#25334D`).
- **Skema Warna Tegas**:
  - **Deep Maroon (`#881337` / `#9F1239`)**: Warna Primer Brand — melambangkan ketegasan, wibawa editorial, dan aksi utama.
  - **Radiant Gold (`#F59E0B` / `#FBBF24`, tint `--gold-subtle`)**: Warna Aksen Sekunder — melambangkan prestise, jadwal penerbitan (_scheduled drip-feed_), dan badge sorotan.
- **Performa & Aksesibilitas**:
  - _Performance Cost_: Low (murni CSS variables, tanpa grafis raster berat).
  - _Accessibility Risk_: Low (memenuhi standar WCAG AA dengan rasio kontras teks minimal 4.5:1).

---

## 4. Colors & Semantic Tokens

### A. Tabel Peran Warna (Semantic Roles)

| Role                | Light Hex | Dark Hex  | CSS Variable               | On Role (Text)        | Makna & Penggunaan                           |
| :------------------ | :-------- | :-------- | :------------------------- | :-------------------- | :------------------------------------------- |
| **Primary**         | `#881337` | `#9F1239` | `--color-primary`          | `#FFFFFF`             | Brand utama, tombol CTA utama, sidebar aktif |
| **Secondary**       | `#F1F5F9` | `#1F293D` | `--color-secondary`        | `#0F172A` / `#F8FAFC` | Tombol sekunder, background badge netral     |
| **Accent / CTA**    | `#F59E0B` | `#FBBF24` | `--color-accent`           | `#0F172A` / `#0B0F19` | Aksen emas, penanda jadwal, highlight VIP    |
| **Background**      | `#F4F5F7` | `#0B0F19` | `--color-background`       | `#0F172A` / `#F8FAFC` | Kanvas dasar aplikasi                        |
| **Foreground**      | `#0F172A` | `#F8FAFC` | `--color-foreground`       | —                     | Warna teks tubuh utama                       |
| **Card**            | `#FFFFFF` | `#151C2C` | `--color-card`             | `#0F172A` / `#F8FAFC` | Kartu tugas, panel modul, dialog modal       |
| **Card Foreground** | `#0F172A` | `#F8FAFC` | `--color-card-foreground`  | —                     | Teks di dalam kartu                          |
| **Muted**           | `#EBEFF4` | `#1F293D` | `--color-muted`            | `#64748B` / `#94A3B8` | Area non-aktif, border tabel, skeleton       |
| **Muted Text**      | `#64748B` | `#94A3B8` | `--color-muted-foreground` | —                     | Label sekunder, waktu pembuatan, slug        |
| **Border**          | `#E2E8F0` | `#25334D` | `--color-border`           | —                     | Garis pembatas kartu 1px dan divider         |
| **Ring**            | `#881337` | `#FBBF24` | `--color-ring`             | —                     | Outline indikator fokus keyboard (A11y)      |
| **Success**         | `#059669` | `#10B981` | `--color-success`          | `#FFFFFF` / `#0B0F19` | Artikel Live/Published di WordPress          |
| **Warning / Sched** | `#F59E0B` | `#FBBF24` | `--color-warning`          | `#0F172A` / `#0B0F19` | Status antrean terjadwal (_future_)          |
| **Destructive**     | `#E11D48` | `#F43F5E` | `--color-destructive`      | `#FFFFFF`             | Kegagalan sinkronisasi / error API           |
| **AI Process**      | `#8B5CF6` | `#A78BFA` | `--color-ai-process`       | `#FFFFFF` / `#0B0F19` | Proses generasi AI / keyword research        |
| **Sync WP**         | `#0EA5E9` | `#38BDF8` | `--color-info`             | `#0F172A` / `#0B0F19` | Proses upload media / posting WP REST API    |
| **Sidebar**         | `#FFFFFF` | `#151C2C` | `--color-sidebar`          | `#0F172A` / `#F8FAFC` | Latar sidebar (`--sidebar-primary`, `-accent`, `-border`, `-ring` mengikuti primary/secondary/border/ring) |

> Kolom "On Role" = token `--color-<peran>-foreground` (teks/ikon DI ATAS isian solid peran). Nilai disesuaikan Fase 4
> agar kontras teks ≥ 4.5:1 (putih di atas amber/sky/hijau terang tidak lolos AA). Token lain: `--popover(-foreground)`,
> `--primary-hover`, `--input`, `--gold-subtle`. Sumber kebenaran nilai: `src/app/globals.css`.

### B. Struktur Token di `globals.css` (Tailwind CSS v4)

Tiga lapis: (1) nilai mentah di `:root` (terang) dan `.dark` (gelap; varian `dark:` aktif lewat
`@custom-variant dark (&:where(.dark, .dark *))` dan kelas `.dark` yang dipasang skrip tema di root layout); (2) `@theme inline`
memetakan `--<token>` ke `--color-<token>` sehingga utilitas `bg-*`/`text-*`/`border-*` tersedia; (3) skala lain di `@theme inline`:
`--radius-sm/md/lg/xl`, `--text-2xs`, `--font-sans`/`--font-mono`. Cuplikan (nilai lengkap: tabel §4A, §4C, dan berkasnya):

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@layer base {
  :root {
    color-scheme: light;
    --background: #f4f5f7;
    --primary: #881337;
    --success: #059669;
    --success-foreground: #ffffff;
    --success-strong: #047857;
    /* … peran status lain, --radius: 0.5rem, --sidebar-* */
  }
  .dark {
    color-scheme: dark;
    --background: #0b0f19;
    --primary: #9f1239;
    /* … */
  }
}

@theme inline {
  --color-background: var(--background);
  --color-success-strong: var(--success-strong);
  --color-sidebar: var(--sidebar-background);
  --radius-lg: var(--radius);
  --text-2xs: 0.625rem;
  --font-sans: var(--font-sans), "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
}
```

Utilitas/komponen tambahan di berkas yang sama: `.dashboard-grid` (latar kisi) dan tipografi konten `.prose`/`.article-rendered`
(pratinjau artikel).

### C. Varian Peran Status (Fase 4)

Setiap peran status (`success`, `warning`, `destructive`, `ai-process`, `info`) punya tiga token (terang **dan** gelap):

| Token | Utility | Pakai untuk |
| :--- | :--- | :--- |
| `--<peran>` | `bg-success`, `text-success`, `border-success/30`, `bg-success/10` | Isian solid (dot status, progress, ikon), tint latar (`/10`, `/15`), border (`/30`) |
| `--<peran>-foreground` | `text-success-foreground` | Teks/ikon di atas isian solid `bg-<peran>` |
| `--<peran>-strong` | `text-success-strong` | Teks/ikon berwarna peran di atas `background`/`card`/`muted` dan tint `bg-<peran>/10` |

| Peran | `-strong` terang | `-strong` gelap | Kontras min. teks di atas tint `/10` pada background/card (terang · gelap) |
| :--- | :--- | :--- | :--- |
| success | `#047857` | `#6EE7B7` | 4.5 · 9.6 |
| warning | `#92400E` | `#FCD34D` | 6.1 · 9.7 |
| destructive | `#BE123C` | `#FDA4AF` | 4.9 · 8.2 |
| ai-process | `#6D28D9` | `#C4B5FD` | 5.8 · 7.9 |
| info | `#0369A1` | `#7DD3FC` | 4.9 · 8.5 |

**Pemetaan palet mentah → token** (palet Tailwind mentah dilarang; dicek `npm run audit:hygiene`, cek `raw-palette-color`):

| Pola lama | Token |
| :--- | :--- |
| `text-emerald-600 dark:text-emerald-400` | `text-success-strong` |
| `bg-emerald-50 dark:bg-emerald-950/40`, `bg-emerald-500/15` | `bg-success/10` |
| `border-emerald-200 dark:border-emerald-800/50`, `border-emerald-500/30` | `border-success/30` |
| `bg-emerald-500` (dot/bar) | `bg-success` |
| amber / yellow / orange | `warning` |
| sky / blue / cyan / teal | `info` |
| purple / violet / indigo | `ai-process` |
| rose / red | `destructive` |
| slate / gray / zinc / neutral | `muted`, `muted-foreground`, `secondary`, `foreground/80`, `border` |

Callout berwarna memakai atom `Alert` (`variant`: `default`/`destructive`/`success`/`warning`/`info`/`ai`), bukan div ber-kelas palet.
Badge status memakai varian peran atom `Badge` (`success`/`warning`/`info`/`destructive`/`ai`: border `/30`, tint `/10`,
teks `-strong`; `muted` untuk status netral: `border-border bg-muted text-muted-foreground`; `secondary`), bukan
`variant="outline"` + kelas token manual. Molekul hanya menambah kelas tata letak (`h-5`, `gap-*`).

---

## 5. Typography (Tipografi)

- **Heading Font**: `Plus Jakarta Sans` (Weight: 600, 700)
- **Body Font**: `Plus Jakarta Sans` (Weight: 400, 500)
- **Monospace Font**: `JetBrains Mono` (Weight: 400, 500, 600) — untuk metrik data, slug WP, API URLs, dan terminal logs.
- **Karakter**: Tajam, modern, bernuansa SaaS profesional, dan memiliki keterbacaan tinggi pada teks berukuran kecil (12–14px).
- **Pemuatan font**: `next/font/google` di `src/app/layout.tsx` (`Plus_Jakarta_Sans` → `--font-sans`, `JetBrains_Mono` →
  `--font-mono`, subset latin, di-host mandiri saat build — tanpa `@import` Google Fonts di CSS). Utilitas: `font-sans`, `font-mono`.

### Skala Tipografi

| Token       | Ukuran          | Line Height | Penggunaan Spesifik                              |
| :---------- | :-------------- | :---------- | :----------------------------------------------- |
| `text-2xs`  | 10px / 0.625rem | 0.875rem    | Label mikro saja: counter badge, kbd, overline mono uppercase, string versi |
| `text-xs`   | 12px / 0.75rem  | 1rem        | Label badge status, metadata tanggal, breadcrumb, hint & error form |
| `text-sm`   | 14px / 0.875rem | 1.25rem     | Data sel tabel, teks kartu sekunder, helper form |
| `text-base` | 16px / 1rem     | 1.5rem      | Body copy default, teks input formulir           |
| `text-lg`   | 18px / 1.125rem | 1.75rem     | Judul sub-seksi, header modal dialog             |
| `text-xl`   | 20px / 1.25rem  | 1.75rem     | Judul kartu ringkasan, widget stat               |
| `text-2xl`  | 24px / 1.5rem   | 2rem        | Judul halaman dashboard utama                    |
| `text-3xl`  | 30px / 1.875rem | 2.25rem     | Angka KPI utama (misal: Total Post Terbit)       |

**Aturan ukuran mikro (Fase 4).** `text-2xs` (token `--text-2xs` di `globals.css`) adalah satu-satunya langkah di bawah
`text-xs` dan hanya untuk label mikro non-kalimat; kalimat, hint, pesan error, dan label badge status minimal `text-xs`.
Ukuran arbitrer `text-[Npx]` dilarang (cek audit `arbitrary-text-size`). Pemetaan saat merombak halaman:
`text-[9px]`/`text-[10px]`/`text-[10.5px]` → `text-2xs` (label mikro) atau `text-xs` (kalimat);
`text-[11px]`/`text-[12px]` → `text-xs`; `text-[13px]` → `text-sm`.

---

## 6. Spacing, Elevasi & Geometri (The Fluent-Trello Pattern)

- **Base Spacing Grid**: Kelipatan 4px (`gap-1` = 4px, `gap-2` = 8px, `gap-3` = 12px, `gap-4` = 16px, `gap-6` = 24px).
- **Border Radius (Crisp & Balanced)** — turunan `--radius: 0.5rem` di `@theme inline`:
  - `rounded-sm`: 4px (item menu dropdown/select)
  - `rounded-md`: 6px (tombol, input, textarea, select, popover, dropdown)
  - `rounded-lg`: 8px (dialog, alert, tooltip, panel)
  - `rounded-xl`: 12px (atom `Card`)
  - `rounded-full`: 9999px (atom `Badge`, avatar, pill status)
- **Elevasi & Bayangan** (skala bawaan Tailwind, tanpa nilai arbitrer):
  - **Kontrol / Base**: `shadow-2xs`/`shadow-xs` (input, tombol) dan `border border-border bg-card shadow-sm` (atom `Card`)
  - **Overlay**: `shadow-md` (popover, isi select/dropdown) dan `shadow-lg` (dialog, alert dialog, tooltip)
  - Hover tidak mengubah ukuran elemen (§9); cukup perubahan warna/latar (`transition-colors`).

---

## 7. Motion & Micro-Interactions

- **Prinsip**: transisi mikro CSS 150–200 ms (`transition-colors`, `duration-150`/`duration-200`) untuk hover, fokus, dan
  perubahan status; tanpa library animasi JavaScript.
- **Indikator proses**: ikon `Loader2`/status berputar `animate-spin` (mis. `syncing_to_wp` di `StatusBadge`) dan
  `animate-pulse` untuk skeleton/indikator live — selalu dipasangkan `motion-reduce:animate-none`.
- **Overlay**: atom shadcn (dialog, alert dialog, popover, select, dropdown, tooltip) memakai kelas `animate-in`/`fade-in-0`/
  `zoom-in-95`/`slide-in-from-*` (masuk) dan `animate-out`/`fade-out-0`/`zoom-out-95` (keluar) dari `tw-animate-css`
  (`@import "tw-animate-css"` di `globals.css`, padanan Tailwind v4 untuk `tailwindcss-animate`); durasi bawaan 150 ms,
  dialog 200 ms (`duration-200`).
- **Accessibility / Reduced Motion**: setiap animasi wajib punya varian `motion-reduce:*` (atau `@media (prefers-reduced-motion: reduce)`)
  yang langsung menampilkan hasil final statis. Jaring pengaman global di `@layer base` `globals.css`: saat
  `prefers-reduced-motion: reduce`, semua animasi & transisi berdurasi ~0 (`0.01ms`, satu iterasi) — termasuk overlay,
  `animate-spin`, `animate-pulse`, dan skeleton — sehingga `animationend` tetap terkirim dan overlay Radix tetap tertutup normal.

---

## 8. Pola UI/UX Spesifik Domain (WordPress Multi-Site)

### A. Pemilih & Status Situs

- Tidak ada switcher situs global di header: situs dipilih per form (Tulis Cepat/Massal/Terstruktur) dan, untuk WP Tools,
  lewat selector ringkas di `PageHeader.actions` (`?site=<uuid>`).
- Identitas situs: molekul `SiteBadge` (ikon `Globe`, nama, domain, dot status dari `SITE_STATUS_META`).
- **Pill status koneksi** (`wp_sites.status`, molekul `SiteStatusBadge` di `src/components/molecules/site-status-badge.tsx`,
  sumber `SITE_STATUS_META` yang juga dipakai `SiteBadge`; varian `Badge` §4C):

  | Status | Label | Varian `Badge` |
  | :--- | :--- | :--- |
  | `connected` | Tersambung | `success` |
  | `auth_error` | Kredensial ditolak | `destructive` |
  | `rate_limited` | Dibatasi WordPress | `warning` |
  | `unreachable` | Tidak terjangkau | `muted` |

- Tombol **Sambungkan Website** (`ConnectSiteDialog`) di `PageHeader.actions` halaman `/sites`: tab otomatis (otorisasi
  Application Password WordPress) dan manual, tanpa plugin PHP.
- Halaman `/sites/[id]`: tombol **Cek ulang koneksi** (`CheckSiteButton`) di header; bila status bukan `connected`,
  `SiteHealthNotice` menampilkan langkah pemulihan + **Sambungkan ulang** (`ReconnectSiteButton`). Klasifikasi status:
  ARCHITECTURE.md §4.8.

### B. Ingesti Konten

- **Tulis Cepat** (`/posts/new`): satu kata kunci → satu item antrean; status publikasi lewat `PublishStatusSwitcher`.
- **Tulis Massal** (`/queue`): daftar kata kunci per baris → satu batch.
- **Tulis Terstruktur** (`/write/structured`): tempel CSV/TSV/Excel + pemetaan kolom interaktif (`BatchColumnMapper`, parser
  `universal-batch-parser`).
- Ketiganya memakai kerangka `WriterFormCard`; form batch berbagi `writer-fields` dengan strategi eksekusi & jadwal
  (`ScheduleStrategyPicker`: langsung vs. bertahap, pola interval atau tanggal acak, status di WordPress).
- Niche Auto-Ideation dan sumber eksternal (URL/RSS) belum diimplementasikan (Modul 3, lihat PRD).

### C. Badge State Antrean

Molekul `StatusBadge` (`src/components/molecules/status-badge.tsx`) dengan ikon `lucide-react` dan varian peran atom
`Badge` §4C. State yang berbagi peran dibedakan lewat label & ikon, bukan intensitas tint manual:

| `state` | Label UI | Varian `Badge` | Catatan |
| :--- | :--- | :--- | :--- |
| `queued_input` | Menunggu | `muted` | |
| `generating_content` | Sedang Ditulis | `ai` | ikon berputar |
| `ready_to_sync` | Siap Kirim | `info` | |
| `syncing_to_wp` | Mengirim ke Web | `info` | ikon berputar |
| `published_on_wp` | Sudah Terbit | `success` | |
| `scheduled_on_wp` | Dijadwalkan | `warning` | |
| `saved_draft_on_wp` | Tersimpan Draf | `secondary` | |
| `failed_generation` | Gagal Tulis | `destructive` | aksi "Tulis ulang" |
| `failed_sync` | Gagal Kirim | `destructive` | ikon `AlertCircle` (Gagal Tulis: `AlertTriangle`); aksi "Kirim ulang" (tanpa token AI) |

Kelompok status untuk filter & KPI (`src/lib/queue/states.ts`): diproses, terbit, draf, terjadwal, gagal.

### D. Aksi Antrean

- **Bilah aksi massal** (`QueueBulkBar`) muncul di atas tabel saat baris dipilih: "Proses ulang N artikel" dan hapus.
- Aksi per item mengikuti state (`src/lib/queue/retry-actions.ts`): Jalankan sekarang, Tulis ulang, Kirim ulang; hasilnya
  dipantau live (Realtime privat + polling cadangan, ARCHITECTURE.md §11.5) dengan indikator `LiveStatusBadge`.

### E. Form & Umpan Balik (Fase 4)

- Form memakai react-hook-form + zod (`useZodForm`, skema bersama `src/lib/validation/<domain>.ts`) dengan `ControlledField`/
  `FormField` untuk label, hint, error, dan atribut ARIA; error validasi server dipasang ke field (`applyApiIssues`).
- Hasil aksi lewat toast `notify` (`src/lib/ui/notify.ts`); konfirmasi lewat `useConfirm()` (`src/lib/ui/confirm.ts`,
  `tone: "destructive"` untuk aksi merusak). `alert()`/`confirm()` bawaan browser dilarang.
- Form berisi rahasia (kata sandi, kunci API, Application Password, secret webhook): `method="post"` dan tombol kirim
  nonaktif sampai hydrate (`useHydrated`).
- Callout memakai atom `Alert`; loading aksi `disabled` + ikon `Loader2`; kosong → `EmptyState`. Setiap halaman dasbor memakai
  `PageContainer` + `PageHeader` (`.claude/rules/page-layout-standard.md`).

---

## 9. Anti-Patterns to Avoid (Hal yang Dilarang)

- ❌ **Anti-AI-Slop**: Dilarang menggunakan gradien ungu generik (_generic AI slop_), sudut membulat balon yang tidak konsisten (>20px pada kartu data), atau efek blur kaca berlebihan yang mengorbankan keterbacaan data.
- ❌ **No Emoji as Structural Icons**: Dilarang menggunakan karakter emoji (🚀 📝 ⚙️) untuk navigasi atau status sistem. Wajib menggunakan ikon vektor SVG resmi dari `lucide-react`.
- ❌ **No Raw Hex Values in Component Code**: Dilarang menuliskan kode warna heksadesimal mentah di dalam komponen JSX/TSX. Wajib menggunakan semantic utility classes (`bg-primary`, `text-muted-foreground`, dll.).
- ❌ **No Raw Palette / Arbitrary Size**: Dilarang kelas palet Tailwind mentah (`text-emerald-600`) dan ukuran font `text-[Npx]`; gunakan token peran (§4C) dan skala tipografi (§5). Dicek `npm run audit:hygiene` (`raw-palette-color`, `arbitrary-text-size`, `arbitrary-color`, `browser-dialog`).
- ❌ **No Layout Shifts on Hover**: Efek hover pada tombol dan kartu tidak boleh mengubah ukuran lebar/tinggi pembatas (_bounds_) yang memicu pergeseran elemen sekitar (_Cumulative Layout Shift_).

---

## 10. Pre-Delivery Checklist (Audit Mutu Mandiri)

Sebelum merilis atau menyelesaikan komponen antarmuka, verifikasi checklist ini:

### Proses & Fungsional

- [ ] Rasio kontras teks minimal 4.5:1 terhadap warna latar belakang (Light & Dark mode terverifikasi independen).
- [ ] Seluruh elemen interaktif memiliki `cursor-pointer` dan transisi hover yang halus (150–200ms).
- [ ] Indikator fokus keyboard (`focus-visible:ring-2`) tampil jelas pada semua tombol dan input.
- [ ] Kompatibel dengan fitur aksesibilitas `prefers-reduced-motion`.
- [ ] Responsif pada 4 breakpoint standar (Mobile 375px, Tablet 768px, Laptop 1024px, Desktop 1440px).

### Kualitas Visual & Integrasi

- [ ] Seluruh ikon menggunakan paket `lucide-react` dengan stroke konsisten (1.5px / 2px).
- [ ] Border dan separator 1px terlihat jelas di kedua tema (Light & Dark).
- [ ] Status antrean terikat langsung dengan status mesin di `ARCHITECTURE.md` §4.
- [ ] Halaman memakai `PageContainer` + `PageHeader`; form memakai pola §8E; `npm run audit:hygiene` lulus.
- [ ] Tidak ada dependensi ke plugin custom WordPress di antarmuka onboarding pengguna.
