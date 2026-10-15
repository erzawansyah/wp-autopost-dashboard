---
paths:
  - "src/components/**/*.tsx"
  - "src/app/**/*.tsx"
  - "src/app/globals.css"
---

# Atomic Design & Styling (Tailwind CSS v4)

Sumber token dan pola visual: `DESIGN.md` dan `src/app/globals.css`. Baca bagian yang relevan sebelum membuat komponen atau halaman baru.

## 1. Atomic Design (komponen dulu, halaman belakangan)
| Lapisan | Lokasi | Isi |
| :--- | :--- | :--- |
| atoms | `src/components/atoms/` | Primitive Radix/shadcn tanpa logika domain (`button`, `input`, `badge`, `dialog`, …). |
| molecules | `src/components/molecules/` | Gabungan kecil atom dengan satu tujuan (`page-header`, `status-badge`, `language-select`, …). |
| organisms | `src/components/organisms/<fitur>/` | Blok fitur utuh yang boleh memegang state/aksi (`quick-writer/`, `agents/`, `queue-data-table.tsx`, …). |
| templates | `src/components/templates/` | Kerangka tata letak (`dashboard-shell`, `page-container`, `page-skeleton`). |
| providers | `src/components/providers/` | Provider global client (`app-providers`: TanStack Query, Tooltip, `ConfirmProvider`, Toaster). |

- `page.tsx` hanya orkestrator: ambil data, susun template + organism secara deklaratif. Dilarang menulis UI monolitik ratusan baris di file halaman.
- Sebelum membuat komponen baru, cari dulu yang sudah ada di lapisan yang sama; perluas lewat props/varian daripada menduplikasi.
- Komponen baru dari shadcn masuk ke `atoms/` (lihat alias di `components.json`).

## 2. Styling: Zero Arbitrary Hex
- **Dilarang** arbitrary color value: `text-[#881337]`, `bg-[#0F172A]`, `border-[rgb(...)]`, inline `style={{ color: ... }}`.
- Pakai token semantik dari `globals.css`: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`, `border-border`, `bg-accent`, `text-destructive`, `text-success`, `text-warning`, `text-info`, `bg-ai-process`, `bg-sidebar*`, dll.
- **Dilarang** kelas palet Tailwind mentah (`text-emerald-600`, `dark:bg-sky-950/40`, `border-rose-500/30`) dan ukuran font arbitrer (`text-[11px]`). Pakai token peran (`text-success-strong`, `bg-info/10`, `border-destructive/30`, …; DESIGN.md §4) dan skala tipografi (`text-2xs`/`xs`/`sm`; DESIGN.md §5). Dicek `npm run audit:hygiene` (ratchet per berkas di `scripts/audit-allowlist.json`).
- Butuh warna baru → tambahkan token di `globals.css` (light **dan** dark) lalu dokumentasikan di `DESIGN.md`; jangan menyisipkan nilai mentah di komponen.
- Gabungkan kelas kondisional dengan `cn()` dari `src/lib/utils.ts`.
- Setiap UI wajib benar di tema terang dan gelap.

## 3. Checklist sebelum selesai
- Komponen ditempatkan di lapisan atomic yang tepat dan tidak menduplikasi yang sudah ada.
- Tidak ada arbitrary color value (`grep -rnE "\[#[0-9a-fA-F]{3,8}\]" src` harus kosong), palet mentah, `text-[Npx]`, maupun `alert()`/`confirm()` (pakai `notify`/`useConfirm`).
- Ikuti anti-pattern & pre-delivery checklist di `DESIGN.md` §9–10.
