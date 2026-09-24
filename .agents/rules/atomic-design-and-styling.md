# Aturan Desain & Styling: Atomic Design & Modular Tailwind CSS

Dokumen ini adalah **Aturan Wajib (Non-Negotiable Rule)** untuk seluruh pengembangan frontend dan antarmuka di repositori `wp-autopost-dashboard`.

---

## 1. Prinsip Atomic Design (Wajib Sebelum Membuat Halaman)

Setiap kali diminta membuat atau merekayasa halaman (`page.tsx`), **DILARANG LANGSUNG MEMBUAT KOMPONEN MONOLITIK BESAR DI DALAM FILE HALAMAN**.

Agent **WAJIB** berpikir secara Atomic dan membangun komponen modularnya terlebih dahulu ke dalam struktur taksonomi `src/components/`:

```
src/components/
├── atoms/        # Elemen dasar tidak dapat dipecah lagi (Button, Badge, Card, Input, Label, Select, Dialog, Tabs, Switch, Checkbox, dll.)
├── molecules/    # Gabungan 2+ atom untuk fungsi spesifik (StatusBadge, SearchInput, MetricCard, SiteBadge, FormField, EmptyState, ModeToggle)
├── organisms/    # Bagian antarmuka independen terpadu (SidebarNav, TopNavbar, KPISummaryGrid, QueueDataTable, Modal Formulir)
└── templates/    # Kerangka struktur halaman (DashboardLayout, AuthLayout, FullWidthLayout)
```

### Prosedur Standar Pembuatan Halaman:
1. **Identifikasi Kebutuhan UI**: Bedah antarmuka menjadi atom, molekul, dan organisme.
2. **Cek Ketersediaan Komponen**: Periksa apakah atom/molekul sudah ada di `src/components/atoms/` atau `src/components/molecules/`.
3. **Bangun / Ekstrak Komponen Terlebih Dahulu**: Jika belum ada, buat komponen modularnya terlebih dahulu, berikan tipe TypeScript yang ketat (`strict: true`), dan uji komposisinya.
4. **Komposisi Halaman (`page.tsx`)**: File halaman hanya boleh bertindak sebagai *orchestrator* deklaratif yang mengomposisikan Templates dan Organisms, mengikat state, dan mengalirkan data (data fetching / state handler).

---

## 2. Aturan Ketat Tailwind CSS Modular (Zero Arbitrary Hex)

### ⛔ LARANGAN KERAS:
- **DILARANG MENGGUNAKAN ARBITRARY HEX VALUES**:
  - ❌ `text-[#881337]`, `bg-[#0F172A]`, `border-[#E2E8F0]`, `hover:bg-[#700F2B]`
  - Penggunaan arbitrary hex merusak kemampuan theming, inkonsisten saat Dark Mode, dan tidak modular.
- **DILARANG MEMBUAT KELAS KUSTOM DILUAR TOKEN**:
  - Jangan menulis inline styles `style={{ color: '#...' }}` untuk komponen standar.

### ✅ KEWAJIBAN PENGGUNAAN TOKEN RESMI:
Gunakan hanya token semantik Tailwind CSS v4 yang telah didaftarkan di [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md) dan [`src/app/globals.css`](file:///d:/Antigravity/wp-autopost-dashboard/src/app/globals.css):

| Peruntukan               | Token Semantik yang Wajib Digunakan                                       |
| :----------------------- | :------------------------------------------------------------------------ |
| **Brand Utama**          | `bg-primary`, `text-primary`, `hover:bg-primary/90`, `ring-primary`       |
| **Aksen / Highlight**    | `bg-accent`, `text-accent`, `bg-gold-subtle`                              |
| **Latar Kanvas & Teks**  | `bg-background`, `text-foreground`                                        |
| **Kontainer Kartu**      | `bg-card`, `text-card-foreground`, `border-border`                        |
| **Muted / Netral**       | `bg-muted`, `text-muted-foreground`, `bg-secondary`                       |
| **Status Sukses (WP)**   | `bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300` atau `text-success` |
| **Status Terjadwal**     | `bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300` atau `text-warning` |
| **Status Gagal / Error** | `bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300` atau `text-destructive` |
| **Proses AI**            | `bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300` atau `text-ai-process` |
| **Sinkronisasi WP**      | `bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300` atau `text-info` |

> **Protokol Penambahan Token**: Jika ada kebutuhan warna/elemen baru yang benar-benar belum tercakup, daftarkan token semantik baru terlebih dahulu ke dalam `@theme` di [`globals.css`](file:///d:/Antigravity/wp-autopost-dashboard/src/app/globals.css) dan catat di [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md) sebelum menerapkannya di komponen.

---

## 3. Kepatuhan Mutlak terhadap PRD.md dan DESIGN.md

1. **`PRD.md` adalah Baseline Fungsional**: Setiap field, validasi form, logika state machine (9 status), tombol aksi, dan edge case harus 100% selaras dengan [`PRD.md`](file:///d:/Antigravity/wp-autopost-dashboard/PRD.md).
2. **`DESIGN.md` adalah Baseline Visual & UX**: Layout, hierarki visual (Trello-Fluent Operations Hub), kepadatan informasi (*density 8/10*), dan interaksi mikro harus 100% selaras dengan [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md).
3. **Komposisi Shadcn**:
   - Selalu impor utilitas styling `import { cn } from "@/lib/utils"`.
   - Gunakan `gap-*` dengan `flex`, bukan `space-x-*` atau `space-y-*`.
   - Gunakan `size-*` jika width dan height bernilai sama.
