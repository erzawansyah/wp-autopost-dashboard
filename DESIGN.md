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
- **Struktur Halaman Utama**:
  1. **Top Bar**: Global Site Switcher (indikator kesehatan koneksi REST API), pemilih profil organisasi, tombol aksi cepat (+ New Batch), dan toggle Light/Dark Mode.
  2. **Sub-Header / Quick Telemetry**: Kartu KPI ringkas (Total Post Terbit, Antrean Aktif, Tingkat Keberhasilan WP, Kuota AI).
  3. **Main Content Canvas (Dual View)**:
     - **Trello/Kanban Board Mode**: Kolom alur tahap artikel (_Queued -> Generating -> Ready to Sync -> Published/Failed_).
     - **Data Table Mode**: Tabel data padat (@tanstack/react-table) dengan _sticky header_, _multi-select_, dan filter status.
  4. **Sticky Bottom Action Bar**: Muncul saat item dipilih atau batch dijalankan (_Immediate Run vs. Smart Schedule_).

---

## 3. Style & Karakter Visual (_Brand Vibe_)

- **Nama Gaya**: _Authoritative Precision Publishing (Fluent-Trello Adaptation)_
- **Mode Dukungan**: **Light Mode (Primary Default)** + **Dark Mode (Full Support)**.
  - _Light Mode_: Latar kanvas abu-abu slate lembut (`#F4F5F7`), kartu putih bersih (`#FFFFFF`), border presisi (`#E2E8F0`), kontras teks tinggi (`#0F172A`).
  - _Dark Mode_: Latar kanvas obsidian midnight (`#0B0F19`), kartu berlapispelan (`#151C2C`), border slate (`#25334D`).
- **Skema Warna Tegas**:
  - **Deep Maroon (`#881337` / `#9F1239`)**: Warna Primer Brand — melambangkan ketegasan, wibawa editorial, dan aksi utama.
  - **Radiant Gold (`#D97706` / `#F59E0B` / `#D4AF37`)**: Warna Aksen Sekunder — melambangkan prestise, jadwal penerbitan (_scheduled drip-feed_), dan badge sorotan.
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
| **Accent / CTA**    | `#F59E0B` | `#FBBF24` | `--color-accent`           | `#0F172A`             | Aksen emas, penanda jadwal, highlight VIP    |
| **Background**      | `#F4F5F7` | `#0B0F19` | `--color-background`       | `#0F172A` / `#F8FAFC` | Kanvas dasar aplikasi                        |
| **Foreground**      | `#0F172A` | `#F8FAFC` | `--color-foreground`       | —                     | Warna teks tubuh utama                       |
| **Card**            | `#FFFFFF` | `#151C2C` | `--color-card`             | `#0F172A` / `#F8FAFC` | Kartu tugas, panel modul, dialog modal       |
| **Card Foreground** | `#0F172A` | `#F8FAFC` | `--color-card-foreground`  | —                     | Teks di dalam kartu                          |
| **Muted**           | `#EBEFF4` | `#1F293D` | `--color-muted`            | `#64748B` / `#94A3B8` | Area non-aktif, border tabel, skeleton       |
| **Muted Text**      | `#64748B` | `#94A3B8` | `--color-muted-foreground` | —                     | Label sekunder, waktu pembuatan, slug        |
| **Border**          | `#E2E8F0` | `#25334D` | `--color-border`           | —                     | Garis pembatas kartu 1px dan divider         |
| **Ring**            | `#881337` | `#FBBF24` | `--color-ring`             | —                     | Outline indikator fokus keyboard (A11y)      |
| **Success**         | `#059669` | `#10B981` | `--color-success`          | `#FFFFFF`             | Artikel Live/Published di WordPress          |
| **Warning / Sched** | `#D97706` | `#FBBF24` | `--color-warning`          | `#FFFFFF` / `#0B0F19` | Status antrean terjadwal (_future_)          |
| **Destructive**     | `#E11D48` | `#F43F5E` | `--color-destructive`      | `#FFFFFF`             | Kegagalan sinkronisasi / error API           |
| **AI Process**      | `#8B5CF6` | `#A78BFA` | `--color-ai-process`       | `#FFFFFF`             | Proses generasi AI / keyword research        |
| **Sync WP**         | `#0EA5E9` | `#38BDF8` | `--color-info`             | `#FFFFFF`             | Proses upload media / posting WP REST API    |

### B. Kode Implementasi CSS Variables (Tailwind CSS v4)

```css
@import "tailwindcss";

@layer base {
  :root {
    --background: #f4f5f7;
    --foreground: #0f172a;
    --card: #ffffff;
    --card-foreground: #0f172a;
    --popover: #ffffff;
    --popover-foreground: #0f172a;
    --primary: #881337;
    --primary-foreground: #ffffff;
    --primary-hover: #700f2b;
    --accent: #f59e0b;
    --accent-foreground: #0f172a;
    --gold-subtle: #fef3c7;
    --secondary: #f1f5f9;
    --secondary-foreground: #0f172a;
    --muted: #ebeff4;
    --muted-foreground: #64748b;
    --border: #e2e8f0;
    --input: #e2e8f0;
    --ring: #881337;
    --success: #059669;
    --warning: #f59e0b;
    --destructive: #e11d48;
    --ai-process: #8b5cf6;
    --info: #0ea5e9;
    --radius: 0.5rem;
  }

  .dark {
    --background: #0b0f19;
    --foreground: #f8fafc;
    --card: #151c2c;
    --card-foreground: #f8fafc;
    --popover: #151c2c;
    --popover-foreground: #f8fafc;
    --primary: #9f1239;
    --primary-foreground: #ffffff;
    --primary-hover: #881337;
    --accent: #fbbf24;
    --accent-foreground: #0b0f19;
    --gold-subtle: #451a03;
    --secondary: #1f293d;
    --secondary-foreground: #f8fafc;
    --muted: #1f293d;
    --muted-foreground: #94a3b8;
    --border: #25334d;
    --input: #25334d;
    --ring: #fbbf24;
    --success: #10b981;
    --warning: #fbbf24;
    --destructive: #f43f5e;
    --ai-process: #a78bfa;
    --info: #38bdf8;
  }
}
```

---

## 5. Typography (Tipografi)

- **Heading Font**: `Plus Jakarta Sans` (Weight: 600, 700)
- **Body Font**: `Plus Jakarta Sans` (Weight: 400, 500)
- **Monospace Font**: `JetBrains Mono` (Weight: 400, 500, 600) — untuk metrik data, slug WP, API URLs, dan terminal logs.
- **Karakter**: Tajam, modern, bernuansa SaaS profesional, dan memiliki keterbacaan tinggi pada teks berukuran kecil (12–14px).
- **Google Fonts Import**:

```css
@import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap");
```

### Skala Tipografi

| Token       | Ukuran          | Line Height | Penggunaan Spesifik                              |
| :---------- | :-------------- | :---------- | :----------------------------------------------- |
| `text-xs`   | 12px / 0.75rem  | 1rem        | Label badge status, metadata tanggal, breadcrumb |
| `text-sm`   | 14px / 0.875rem | 1.25rem     | Data sel tabel, teks kartu sekunder, helper form |
| `text-base` | 16px / 1rem     | 1.5rem      | Body copy default, teks input formulir           |
| `text-lg`   | 18px / 1.125rem | 1.75rem     | Judul sub-seksi, header modal dialog             |
| `text-xl`   | 20px / 1.25rem  | 1.75rem     | Judul kartu ringkasan, widget stat               |
| `text-2xl`  | 24px / 1.5rem   | 2rem        | Judul halaman dashboard utama                    |
| `text-3xl`  | 30px / 1.875rem | 2.25rem     | Angka KPI utama (misal: Total Post Terbit)       |

---

## 6. Spacing, Elevasi & Geometri (The Fluent-Trello Pattern)

- **Base Spacing Grid**: Kelipatan 4px (`gap-1` = 4px, `gap-2` = 8px, `gap-3` = 12px, `gap-4` = 16px, `gap-6` = 24px).
- **Border Radius (Crisp & Balanced)**:
  - `rounded-md`: 6px (Input fields, dropdown items, badge status, tag)
  - `rounded-lg`: 8px - 10px (Kartu utama, tombol aksi, modal, container kolom)
  - `rounded-full`: 9999px (Avatar, pills indikator status live situs)
- **Elevasi & Bayangan (Microsoft Fluent Style)**:
  - **Flat Card / Base**: `border border-border bg-card shadow-[0_1px_3px_0_rgba(0,0,0,0.06),0_1px_2px_0_rgba(0,0,0,0.04)]`
  - **Hover Card Lift**: `hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.08),0_2px_4px_-1px_rgba(0,0,0,0.04)] hover:-translate-y-[1px] transition-all duration-150`
  - **Elevated Modals / Popovers**: `shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.04)] border border-border`

---

## 7. Motion & Micro-Interactions

- **Preset**: **Stagger List (Standard)** — Trigger: load or view change | Durasi: 300–400ms | Easing: `power2.out`.

```js
gsap.from(".queue-card", {
  opacity: 0,
  y: 12,
  duration: 0.35,
  stagger: 0.04,
  ease: "power2.out",
});
```

- **Live State Flash**: Baris tabel atau kartu yang baru saja menyelesaikan transisi status (misal dari `syncing_to_wp` ke `published_on_wp`) memancarkan _subtle highlight pulse_ hijau halus selama 800ms.
- **Accessibility / Reduced Motion**:
  Gunakan `@media (prefers-reduced-motion: reduce)` untuk langsung menampilkan hasil final statis tanpa animasi pergeseran atau pemudaran.

---

## 8. Pola UI/UX Spesifik Domain (WordPress Multi-Site)

### A. Global Multi-Site Switcher (Header & Sidebar)

- Favicon situs / inisial domain dalam badge maroon/gold.
- Nama situs & domain URL.
- **Pill Indikator Kesehatan Koneksi**:
  - 🟢 `Connected`: REST API 200 OK & Application Password valid.
  - 🔴 `Auth Error`: Kredensial salah atau diblokir firewall/host.
  - 🟡 `Degraded / Rate Limited`: Shared hosting lambat atau merespons 429/503.
- Tombol cepat **+ Connect New Site** (membuka modal panduan 1 menit tanpa instal plugin PHP).

### B. Omnibox Content Ingestion Wizard

- **Tab 1: CSV / Bulk Spreadsheet**: Drag-and-drop file + _Interactive Column Mapper_.
- **Tab 2: Niche Auto-Ideation**: Input nama niche -> generator keyword -> rekomendasi topik.
- **Tab 3: External Source (URL / RSS)**: Input tautan artikel referensi atau RSS feed.

### C. Batch Queue State Machine Badges

| State Machine Value  | Tampilan UI     | Warna     | Makna                                                |
| :------------------- | :-------------- | :-------- | :--------------------------------------------------- |
| `queued_input`       | Slate / Neutral | `#64748B` | Menunggu giliran generasi AI                         |
| `generating_content` | Violet Pulse    | `#8B5CF6` | AI sedang meriset & menyusun draf                    |
| `ready_to_sync`      | Teal / Cyan     | `#0D9488` | Konten siap dikirim ke WordPress                     |
| `syncing_to_wp`      | Sky Blue Spin   | `#0284C7` | Mengunggah gambar & data ke REST API                 |
| `published_on_wp`    | Emerald Green   | `#059669` | Terbit Live di WordPress (tautan langsung)           |
| `scheduled_on_wp`    | Radiant Gold    | `#D97706` | Terjadwal di WordPress (_future date_)               |
| `saved_draft_on_wp`  | Muted Slate     | `#64748B` | Tersimpan sebagai draf WordPress                     |
| `failed_generation`  | Ruby Red        | `#E11D48` | Gagal saat generasi AI (Opsi Retry AI)               |
| `failed_sync`        | Amber-Red Alert | `#DC2626` | Gagal kirim WP (Retry kirim WP saja, hemat token AI) |

### D. Dual-Mode Execution Bar (Bottom Action Bar)

- Menempel di bagian bawah tabel saat item dipilih atau batch dibuka:
  - **Run Immediately**: Tombol primer maroon dengan progres live real-time (_"Posting 4 of 20 — Max 2 concurrency"_).
  - **Schedule & Drip-Feed**: Tombol emas dengan pemilih tanggal mulai, kuota per hari, dan _humanized randomized timing window_.

---

## 9. Anti-Patterns to Avoid (Hal yang Dilarang)

- ❌ **Anti-AI-Slop**: Dilarang menggunakan gradien ungu generik (_generic AI slop_), sudut membulat balon yang tidak konsisten (>20px pada kartu data), atau efek blur kaca berlebihan yang mengorbankan keterbacaan data.
- ❌ **No Emoji as Structural Icons**: Dilarang menggunakan karakter emoji (🚀 📝 ⚙️) untuk navigasi atau status sistem. Wajib menggunakan ikon vektor SVG resmi dari `lucide-react`.
- ❌ **No Raw Hex Values in Component Code**: Dilarang menuliskan kode warna heksadesimal mentah di dalam komponen JSX/TSX. Wajib menggunakan semantic utility classes (`bg-primary`, `text-muted-foreground`, dll.).
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
- [ ] Status antrean terikat langsung dengan status mesin di `ARCHITECTURE.md`.
- [ ] Tidak ada dependensi ke plugin custom WordPress di antarmuka onboarding pengguna.
