# Worklog 08 — Reset ke Sistem Prompt Tunggal Terstruktur

**Tanggal**: 2026-09-24  
**Fokus**: Penyederhanaan Mesin Pembuatan Artikel AI ke Pendekatan Prompt Langsung yang Bersih & Stabil

---

## 1. Latar Belakang & Evaluasi Lapangan

Setelah pengujian artikel lapangan ("5 warung kopi di karangploso malang"), ditemukan beberapa kendala pada pendekatan tool-calling / skills ReAct:
1. Tool pencarian web pihak ketiga rentan terhadap pemblokiran ISP lokal (*connection timeout* pada domain DuckDuckGo) dan memperlambat latensi pembuatan artikel.
2. Model AI saat mengeksekusi multi-turn ReAct cenderung berperilaku sebagai chatbot interaktif (meminta data tambahan atau meminta maaf atas minimnya hasil riset) daripada bertindak sebagai *autonomous article publisher*.
3. Kompleksitas antarmuka pilihan skill menambah beban visual tanpa memberikan peningkatan kualitas konten yang sebanding.

Sesuai instruksi pengguna ("Gagal dan jelek. Kita ubah aja pendekatannya. Reset system. Untuk tulis artikel, sementara ganti jadi prompt biasa aja dulu"), sistem di-reset dan disederhanakan kembali.

---

## 2. Rincian Perubahan & Pembersihan

1. **Pembersihan Modul Skills Kompleks**:
   - Menghapus folder `src/core/skills/`, endpoint `src/app/api/ai/skills/`, dan komponen molekul `src/components/molecules/skill-selector.tsx`.
   - Menghilangkan state dan toggle skill dari formulir Tulis Cepat (`src/app/posts/new/page.tsx`).

2. **Konsolidasi ke `src/core/writer.ts` & Penghapusan `core/prompts/`**:
   - Menghapus folder `src/core/prompts/` (engine template, system, dan user prompts).
   - Memindahkan dan mengubah nama `src/lib/ai/generator.ts` menjadi **`src/core/writer.ts`**.
   - Menyimpan seluruh prompt (system prompt anti-slop v3.0 dan builder prompt pengguna) secara *self-contained* langsung di dalam `src/core/writer.ts`.
   - Menggunakan eksekusi prompt langsung via `ChatOpenRouter` dengan Zod structured output (`ArticleOutputSchema`) dan fallback JSON parsing standar.
   - Mempertahankan guardrail anti-penolakan chatbot (`isChatbotRefusal`) agar model tidak pernah menerbitkan pesan percakapan chatbot ke WordPress.

3. **Pembaruan Import**:
   - `src/app/api/posts/quick/route.ts` dan `src/app/api/ai/test/route.ts` kini mengimpor langsung dari `@/core/writer`.
   - File lama `src/lib/ai/generator.ts` dihapus bersih.

---

## 3. Hasil Validasi

- **ESLint (`npm.cmd run lint`)**: Lulus 100% tanpa error.
- **Build (`npm.cmd run build`)**: Lulus 100% pada 22 rute Next.js.
