# DESIGN.md — Design System & UI/UX Specification

> **Format Convention**: Sesuai dengan spesifikasi standar **Google Stitch**, **TypeUI**, dan skill desain **`ui-ux-pro-max`** dari `skills.sh`.  
> File ini adalah *single source of truth* untuk seluruh token visual, aturan tipografi, estetika komponen, dan pola interaksi domain **WP Autopost & Multi-Site Content Dashboard**.

---

## 1. Visi Desain & Karakter Visual (*Brand Vibe*)

- **Tema Utama**: *Precision Publishing SaaS* — Modern, bersih, data-dense tapi tetap *breathable*, berkarakter teknis premium tanpa kesan kaku.
- **Mode Tampilan**: **Dark Mode First** (default) dengan dukungan penuh untuk **Light Mode**.
- **Anti-AI-Slop Principle**: Hindari gradien ungu generik (*generic AI slop*), sudut melengkung berlebihan yang tidak konsisten, atau efek blur berlebihan yang merusak kontras baca.
- **Aksen Warna Simbolis**:
  - **Emerald (`#10B981`)**: Melambangkan artikel live, kesuksesan posting, dan pertumbuhan lalu lintas.
  - **Indigo/Cyan (`#06B6D4` / `#6366F1`)**: Melambangkan proses kreasi AI dan mesin optimasi SEO.
  - **Amber (`#F59E0B`)**: Melambangkan antrean terjadwal (*future/drip-feed*).
  - **Rose (`#F43F5E`)**: Melambangkan peringatan, kesalahan koneksi WP, atau batas kuota.

---

## 2. Palet Warna & Semantic Design Tokens

Semua token warna menggunakan format **HSL** untuk mendukung theming dinamis melalui CSS Variables dan integrasi Tailwind CSS.

### A. Dark Theme (Primary Default)

```css
:root[class~="dark"] {
  /* Surface & Backgrounds */
  --background: 222 47% 7%;         /* #090D16 - Deep space obsidian */
  --foreground: 210 40% 98%;        /* #F8FAFC - Bright crisp text */
  --card: 222 40% 10%;              /* #0F172A - Elevated card surface */
  --card-foreground: 210 40% 98%;
  --popover: 222 40% 10%;
  --popover-foreground: 210 40% 98%;

  /* Brand / Primary */
  --primary: 160 84% 39%;           /* #10B981 - Vibrant Emerald */
  --primary-foreground: 222 47% 7%; /* Dark text on emerald */

  /* Secondary & Muted */
  --secondary: 217 33% 17%;         /* #1E293B - Slate surface */
  --secondary-foreground: 210 40% 98%;
  --muted: 217 33% 17%;
  --muted-foreground: 215 20% 65%;   /* #94A3B8 - Readable secondary text */

  /* Accent & Interactive */
  --accent: 217 33% 22%;            /* #25334D */
  --accent-foreground: 210 40% 98%;

  /* Status Colors */
  --success: 160 84% 39%;           /* Emerald */
  --warning: 38 92% 50%;            /* Amber */
  --destructive: 347 77% 50%;       /* Rose */
  --destructive-foreground: 210 40% 98%;
  --info: 199 89% 48%;              /* Cyan / Sky */

  /* Borders & Focus Rings */
  --border: 217 33% 18%;            /* Subtle division line */
  --input: 217 33% 18%;
  --ring: 160 84% 39%;              /* Focus ring emerald */
}
```

### B. Light Theme

```css
:root {
  --background: 0 0% 100%;          /* #FFFFFF - Pure clean canvas */
  --foreground: 222 47% 11%;        /* #0F172A */
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  --popover: 0 0% 100%;
  --popover-foreground: 222 47% 11%;

  --primary: 160 84% 36%;           /* #059669 - Slightly deeper emerald for AA contrast */
  --primary-foreground: 0 0% 100%;

  --secondary: 210 40% 96%;         /* #F1F5F9 */
  --secondary-foreground: 222 47% 11%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;  /* #64748B */

  --border: 214 32% 91%;            /* #E2E8F0 */
  --input: 214 32% 91%;
  --ring: 160 84% 36%;
}
```

---

## 3. Tipografi (*Typography Scale*)

- **Font Utama (Interface & Body)**: `Plus Jakarta Sans`, sans-serif (alternatif: `Inter`).
- **Font Display / Heading**: `Plus Jakarta Sans` dengan `font-weight: 600` atau `700`.
- **Font Monospace (Metrics, Token, Slugs, API URLs)**: `JetBrains Mono`, monospace.

| Skala Token | Ukuran | Line Height | Penggunaan |
| :--- | :--- | :--- | :--- |
| `text-xs` | 12px / 0.75rem | 1rem | Label badge status, metadata tanggal, breadcrumb |
| `text-sm` | 14px / 0.875rem | 1.25rem | Teks tabel, deskripsi form, teks sekunder |
| `text-base` | 16px / 1rem | 1.5rem | Body copy default, input value |
| `text-lg` | 18px / 1.125rem | 1.75rem | Judul sub-seksi, modal headers |
| `text-xl` | 20px / 1.25rem | 1.75rem | Judul kartu ringkasan, widget stat |
| `text-2xl` | 24px / 1.5rem | 2rem | Judul halaman dashboard utama |
| `text-3xl` | 30px / 1.875rem | 2.25rem | Hero KPI metrics (misal: total artikel terbit) |

---

## 4. Spacing, Borders, & Elevation

- **Base Spacing Grid**: Kelipatan 4px (`gap-1` = 4px, `gap-2` = 8px, `gap-4` = 16px, `gap-6` = 24px).
- **Border Radius**:
  - `rounded-sm`: 4px (Tag kecil, kursor indikator)
  - `rounded-md`: 6px (Input fields, dropdown items, badge)
  - `rounded-lg`: 8px (Tombol aksi, kartu kecil)
  - `rounded-xl`: 12px (Container kartu dashboard utama, modal dialog)
  - `rounded-full`: 9999px (Avatar, pills status)
- **Glassmorphism & Shadows**:
  - Header & Sticky Bar: `bg-background/80 backdrop-blur-md border-b border-border`.
  - Floating Panels: `shadow-lg shadow-black/20 border border-border/80`.

---

## 5. Komponen Primitif & Layout Pattern

- **Fondasi Primitif**: Radix UI + `shadcn/ui`.
- **Icon Set**: `lucide-react` (ukuran standar `h-4 w-4` untuk aksi inline, `h-5 w-5` untuk header menu).
- **Data Table**: `@tanstack/react-table` dengan *sticky header*, *selectable rows*, dan *virtual scrolling* untuk menangani batch ratusan artikel tanpa lag.

---

## 6. Pola UI/UX Spesifik Domain (WordPress Multi-Site Autopost)

### A. Global Multi-Site Switcher (Header & Sidebar)
- Menampilkan dropdown situs aktif:
  - Favicon situs / inisial domain.
  - Nama situs & domain URL.
  - **Pill Indikator Kesehatan Koneksi WP**:
    - 🟢 `Connected`: REST API merespons 200 OK & Application Password valid.
    - 🔴 `Auth Error`: Kredensial tidak valid / diblokir firewall.
    - 🟡 `Rate Limited / Degraded`: Hosting lambat atau merespons 429/503.
  - Tombol cepat **+ Connect New Site** yang membuka modal *1-Click Connection Wizard*.

### B. Omnibox Content Ingestion Wizard
Tampilan pembuatan batch dengan navigasi 3 tab mulus:
1. **Tab CSV / Bulk Spreadsheet**:
   - Area drag-and-drop file `.csv` atau `.xlsx`.
   - *Interactive Column Mapper*: UI pemetaan kolom (kolom CSV -> Target Keyword, Title, Category, Scheduled Date).
2. **Tab Niche Auto-Ideation**:
   - Input nama niche + bahasa + target audiens.
   - Pemicu MCP DataForSEO / AI Ideator untuk menampilkan tabel *pre-flight keyword suggestions* sebelum dikonversi menjadi baris antrean.
3. **Tab External Source (URL / RSS)**:
   - Input URL artikel acuan atau URL RSS Feed untuk regenerasi konten orisinal.

### C. Real-Time Batch Queue & State Machine Badges
Setiap baris artikel di tabel antrean wajib menggunakan badge visual konsisten sesuai State Machine di `ARCHITECTURE.md`:

| State Machine Value | Tampilan Badge UI | Aksen Visual |
| :--- | :--- | :--- |
| `queued_input` | `Netral / Slate` | Teks abu-abu, ikon jam pasir statis |
| `generating_content` | `Cyan / Indigo` | Ikon AI berputar / *pulsing animation* |
| `ready_to_sync` | `Teal / Sky` | Ikon centang dokumen siap kirim |
| `syncing_to_wp` | `Blue` | Ikon sinkronisasi dengan animasi putar halus |
| `published_on_wp` | `Emerald (Solid/Border)` | Tautan langsung ke live URL artikel di WordPress |
| `scheduled_on_wp` | `Amber / Purple` | Ikon kalender dengan badge waktu tayang |
| `saved_draft_on_wp` | `Zinc / Muted` | Ikon draf WordPress |
| `failed_generation` | `Rose / Red` | Ikon silang merah + tooltip error AI + tombol **Retry** |
| `failed_sync` | `Rose / Warning` | Ikon sinyal terputus + tooltip error WP + tombol **Retry WP Sync** (tanpa panggil ulang AI!) |

### D. Dual-Mode Execution Bar (Bottom Action Bar)
- Menempel di bagian bawah tabel saat item dipilih atau batch dibuka:
  - **Opsi 1: Run Immediately**: Tombol primer emerald dengan indikator progres real-time (*"Posting 3 of 25 — Max 2 concurrency"*).
  - **Opsi 2: Schedule & Drip-Feed**: Form pemilih tanggal mulai, interval publikasi (misal: *2 artikel per hari*), dan pengacak jam publikasi (*humanized randomized timing window*).

---

## 7. Motion & Micro-Interactions

- **Durasi Standar**: Transisi hover `150ms ease-out`, transisi modal/drawer `250ms cubic-bezier(0.16, 1, 0.3, 1)`.
- **Live Feedback**: Baris tabel yang sedang berubah status (misal dari `generating_content` ke `ready_to_sync`) diberi kilatan *subtle highlight pulse* hijau tipis.
- **Reduced Motion Support**: Gunakan `@media (prefers-reduced-motion: reduce)` untuk mematikan animasi transform/pulse bagi pengguna yang membutuhkannya.

---

## 8. Integrasi dengan Skill `ui-ux-pro-max`

Ketika pengguna meminta bantuan eksplorasi visual, pembuatan komponen baru, atau auditing UI:
1. Agent membaca file `DESIGN.md` ini sebagai batasan token brand.
2. Agent dapat mengombinasikannya dengan inteligensi desain dari `ui-ux-pro-max` untuk memilih pola layout, card density, dan contrast ratio terbaik yang sesuai dengan aturan di sini.
