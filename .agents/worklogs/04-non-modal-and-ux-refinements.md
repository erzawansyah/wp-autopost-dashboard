# Worklog 04 — Non-Modal Operational Architecture & UX Refinements

**Tanggal**: 24 September 2026  
**Status**: Selesai (Passed Lint & Production Build 19/19 routes)  

---

## 1. Latar Belakang & Kebutuhan Revisi

Pengguna menginstruksikan tiga poin perbaikan utama terhadap versi awal MVP:
1. **Peniadaan Modal untuk Alur Operasional**: Hindari penggunaan modal pop-up untuk alur kerja fitur utama seperti Tulis Cepat (*Quick Single Post*) dan formulir input operasional lainnya.
2. **Persistensi Tema Gelap / Terang**: Perbaikan *light/dark mode* yang sebelumnya selalu kembali ke pengaturan sistem operasi saat halaman di-reload, agar patuh pada preferensi yang tersimpan di `localStorage`.
3. **Penyempurnaan Navigasi & Halaman 404**: Menu navigasi yang belum aktif diberi penanda status "Segera" (*Coming Soon*), dan pembuatan halaman 404 khusus yang ramah pengguna.

---

## 2. Perubahan Teknis yang Dilakukan

### A. Workspace Dedikasi Tulis Cepat (`/posts/new`)
- Dibuat halaman mandiri [`src/app/posts/new/page.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/app/posts/new/page.tsx) dengan tata letak dua kolom (formulir di sisi kiri, kartu panduan & tips di sisi kanan).
- Rute `/write` dialihkan secara mulus ke `/posts/new`.
- Tombol aksi utama pada dashboard ringkasan dan header langsung mengarahkan pengguna ke halaman workspace ini tanpa pop-up modal.

### B. Formulir Koneksi Website Inline (`src/app/sites/page.tsx`)
- Formulir pendaftaran website WordPress diubah dari modal menjadi kartu inline yang dapat diperluas (*collapsible inline card*) di bagian atas daftar website.

### C. Persistensi Tema & Anti-Flicker
- Ditambahkan *blocking script* di `<head>` pada [`src/app/layout.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/app/layout.tsx) untuk membaca nilai `theme` dari `localStorage` sebelum proses hidrasi browser dimulai, mencegah kedipan visual (*flash of unstyled theme*).
- Komponen [`src/components/molecules/mode-toggle.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/components/molecules/mode-toggle.tsx) diperbarui menggunakan `React.useSyncExternalStore` guna menyinkronkan status tema antar-tab dan event storage tanpa menimbulkan *cascading render warning*.

### D. Halaman 404 & Indikator Segera
- Dibuat halaman [`src/app/not-found.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/app/not-found.tsx) dengan narasi bersahabat dan navigasi kembali ke Beranda atau Daftar Artikel.
- Dibuat komponen reusable [`src/components/templates/coming-soon-view.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/components/templates/coming-soon-view.tsx) untuk rute yang belum aktif (`/queue`, `/prompts`, `/settings`, `/settings/ai`).
- Ditambahkan badge "Segera" pada sidebar navigation [`src/components/organisms/sidebar-nav.tsx`](file:///d:/Antigravity/wp-autopost-dashboard/src/components/organisms/sidebar-nav.tsx).

---

## 3. Hasil Verifikasi

- `npx.cmd eslint`: 0 error, 0 warning.
- `npm.cmd run build`: 19/19 rute terkompilasi sukses.
