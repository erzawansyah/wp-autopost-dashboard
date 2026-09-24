# Worklog 05 — WordPress Categories Multi-Select, Tag Auto-Resolution, and OpenRouter Agent SDK Integration

## 1. Konteks & Permintaan Pengguna
1. Pemilihan Kategori WordPress pada modul Tulis Cepat diubah dari input teks biasa menjadi **multi-select box** yang mengambil kategori nyata dari situs WordPress terkait.
2. Tidak diizinkan membuat kategori baru di form ini (strictly no category creation).
3. Tag artikel tetap diinput dengan pemisah koma, dan diizinkan membuat tag baru di WordPress secara otomatis jika belum ada.
4. Perbaikan select box agar membentang penuh (*full width*) mengisi ruang form yang kosong.
5. Penanganan error 401 OpenRouter (`User not found`) dan refactor flow penulisan artikel menggunakan **`@openrouter/agent` SDK resmi** dengan dukungan multi-model dan BYOK (Bring Your Own Key).

## 2. Solusi & Perubahan Teknis
- **`src/lib/wordpress/client.ts`**:
  - Menambahkan fungsi `fetchWordPressCategories` (`GET /wp-json/wp/v2/categories?per_page=100`) dengan decoding entity nama kategori.
  - Menambahkan fungsi `resolveOrCreateWordPressTags` (`GET /wp-json/wp/v2/tags?search=...` dan `POST /wp-json/wp/v2/tags`) untuk mengonversi tag teks menjadi array tag ID numerik di WordPress.
  - Memperbarui `createWordPressPost` untuk menerima `categories: number[]` dan `tags: number[]`.
- **`src/app/api/sites/[id]/categories/route.ts`**:
  - Endpoint REST baru untuk mengambil kategori dari blog WordPress pengguna yang terenkripsi.
- **`src/components/atoms/select.tsx` & `src/components/atoms/popover.tsx`**:
  - Mengubah `SelectTrigger` dari `w-fit` menjadi `w-full` agar konsisten mengisi seluruh kontainer form.
  - Mengatur default `SelectContent` ke `position="popper"` selebar trigger (`w-[var(--radix-select-trigger-width)]`).
  - Menambahkan komponen atom `Popover` berbasis Radix UI.
- **`src/components/molecules/wp-category-select.tsx`**:
  - Komponen multi-select interaktif dengan checkbox, chips/badges yang bisa dihapus satu per satu, pencarian kategori cepat, tombol segarkan, dan penanganan error/loading.
- **`src/lib/ai/generator.ts`**:
  - Refactor penuh menggunakan `@openrouter/agent` (`OpenRouter` client dan `client.callModel`).
  - Sanitasi API key, penanganan error 401 dan 402 yang manusiawi dan edukatif.
  - Multi-model support: GPT-OSS 120B, Gemini 2.5 Flash, Claude 3.5 Sonnet, DeepSeek V3, Llama 3.3.
- **`src/app/api/ai/test/route.ts`**:
  - Endpoint pengujian kunci API OpenRouter secara real-time via `openrouter.ai/api/v1/auth/key`.
- **`src/app/settings/ai/page.tsx`**:
  - Halaman Pengaturan AI fungsional dengan penguji kunci OpenRouter, pemilihan model default, dan persistensi BYOK.
- **`src/app/posts/new/page.tsx`**:
  - Integrasi `WPCategorySelect`, hint/tooltip tag dinamis, panel model AI yang bisa di-*expand*, dan pengiriman `aiModel` serta `apiKey` ke API backend.

## 3. Status Verifikasi
- `npm run build` sukses 100% pada semua 22 rute dan API endpoints tanpa error TypeScript atau linting.
