# Worklog 03: Rombak Total Copywriting Dashboard & AI Generator (Anti-Slop Writing)

## Ringkasan Eksekusi
- **Tanggal**: 2026-09-24
- **Referensi Acuan**: [`anti-slop-writing` v3.0](https://github.com/adenaufal/anti-slop-writing)
- **Tujuan**: Menghilangkan seluruh jejak gaya tulisan AI yang kaku, klise, jargon teknis berlebihan, dan membosankan dari antarmuka dashboard serta generator artikel AI.

## Kaidah Anti-Slop yang Diterapkan
1. **Kebijakan Tanda Baca (Nol Dash)**:
   - Dilarang total menggunakan em dash (`—`) dan en dash (`–`).
   - Diganti dengan tanda titik untuk memecah kalimat, koma, atau tanda kurung.
2. **Eliminasi Banlist Kata Klise AI**:
   - Membuang kata penggelembung: "sangat krusial", "sangat penting", "fundamental", "ekosistem", "lanskap", "menyoroti", "menggarisbawahi", "menyelami", "optimalisasi", "di era digital yang serba cepat ini", "bukan sekadar X melainkan Y".
   - Menghilangkan jargon teknis di antarmuka publik yang terasa seperti marketing mesin ("9-State Machine Engine Active", "Zero-Plugin Onboarding", "Cost-Saver Aktif").
3. **Register Bahasa yang Wajar (Tier 2 Semi-Formal)**:
   - Bahasa Indonesia yang mengalir, lugas, bersahabat, dan praktis seperti ditulis oleh webmaster atau pengelola blog sungguhan.

## Berkas yang Dirombak
1. [`src/lib/ai/generator.ts`](file:///d:/Antigravity/wp-autopost-dashboard/src/lib/ai/generator.ts):
   - Menerapkan sistem prompt anti-slop v3.0 lengkap dengan aturan burstiness, variasi pembuka kalimat, larangan klise, dan sanitasi otomatis nol dash pada output JSON.
2. [`src/components/organisms/sidebar-nav.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/components/organisms/sidebar-nav.tsx):
   - "Multi-Site Publisher" -> "Kelola pos banyak web"
   - "Antrean & Batch" -> "Antrean Pos", "WordPress Sites" -> "Daftar Website", "Prompt Templates" -> "Format Tulisan", "AI Providers" -> "Kunci API AI", "Pengaturan Sistem" -> "Setelan"
   - Status card: "Koneksi normal", "Gaya Tulisan Wajar".
3. [`src/components/organisms/top-navbar.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/components/organisms/top-navbar.tsx):
   - "+ Quick Single Post" -> "+ Tulis Cepat"
   - "Situs Aktif: Semua Situs (Multi-Site)" -> "Pilih website: Semua Website"
4. [`src/components/organisms/kpi-summary-grid.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/components/organisms/kpi-summary-grid.tsx):
   - "Artikel Terbit", "Draf & Antrean", "Website Terhubung", "Tingkat Keberhasilan".
5. [`src/app/login/page.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/app/login/page.tsx):
   - Teks sambutan, judul tab, tombol aksi, dan pesan footer diubah ke bahasa yang ringkas dan bersahabat.
6. [`src/app/sites/page.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/app/sites/page.tsx):
   - Instruksi pembuatan Application Password dibuat jauh lebih praktis dan ramah pemula tanpa jargon berbelit.
   - Tombol pengujian koneksi menjadi "Cek Koneksi Dulu".
7. [`src/components/organisms/quick-single-modal.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/components/organisms/quick-single-modal.tsx):
   - Label menjadi "Tulis Cepat", "Topik atau Kata Kunci Utama", "Tujuan Penyimpanan di Blog", "Tulis & Kirim Sekarang".
8. [`src/app/page.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/app/page.tsx):
   - Judul dashboard "Dashboard Penerbitan", panduan awal "Sambungkan blog WordPress Anda dulu", dan teks empty state yang natural.
9. [`src/components/molecules/status-badge.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/components/molecules/status-badge.tsx) & [`src/components/organisms/queue-data-table.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/components/organisms/queue-data-table.tsx):
   - Status badge: "Sedang Ditulis", "Siap Kirim", "Sudah Terbit", "Tersimpan Draf", "Gagal Tulis", "Gagal Kirim".

## Hasil Verifikasi
- `npm.cmd run build`: 100% lulus untuk 13 route.
- `npx.cmd eslint`: 0 error, 0 warning.
- Nol karakter dash (`—`/`–`) di seluruh file kode frontend dan backend.
