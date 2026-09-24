# Worklog 07 — Pemisahan Direktori Prompt dan Mesin Variabel Dinamis ${{key}}

## 1. Konteks & Permintaan Pengguna
1. Pengguna menginstruksikan agar seluruh prompt yang digunakan oleh AI engine tidak di-hardcode di dalam file TypeScript, melainkan diletakkan pada direktori khusus prompt.
2. Disediakan mekanisme penggantian variabel dinamis berbasis sintaks `${{key}}` (seperti `${{keyword}}`, `${{category}}`, `${{tags}}`, `${{customBrief}}`).
3. Arsitektur ini disiapkan agar nantinya agen penulis dapat dipasangi modul kemampuan (*Skills*) plug-and-play secara mudah.

## 2. Solusi & Perubahan Teknis
- **Direktori Prompt Terstruktur (`src/core/prompts/`)**:
  - `src/core/prompts/system/anti-slop-base.md`: Prompt persona penulis profesional Indonesia dengan penegakan ketat Anti-Slop Writing v3.0 (zero dash, no AI clichés, high burstiness, dan valid JSON output).
  - `src/core/prompts/user/quick-article.md`: Template instruksi penulisan artikel dengan placeholder `${{keyword}}`, `${{category}}`, `${{tags}}`, dan `${{customBrief}}`.
  - `src/core/prompts/index.ts`: Entry point ekspor modul prompt.
- **Template Engine (`src/core/prompts/engine/template-engine.ts`)**:
  - Fungsi `renderPrompt(templateContent, variables, options)`:
    - Mengganti `${{key}}` dan `${{ key }}` dengan nilai variabel dinamis.
    - Menangani tipe array dengan konversi otomatis menjadi *comma-separated string*.
    - Fitur `stripEmptyVariables`: Menghapus baris bullet/label secara otomatis jika variabel terkait bernilai kosong atau tidak didefinisikan (mencegah munculnya label kosong di prompt).
  - Fungsi `loadPromptTemplate(relativePath)`: Membaca berkas template prompt dari `src/core/prompts/`.
- **Refactoring Generator (`src/lib/ai/generator.ts`)**:
  - Mengeliminasi string prompt hardcoded.
  - Membaca dan me-render `system/anti-slop-base.md` dan `user/quick-article.md` secara dinamis sebelum memanggil `ChatOpenRouter`.

## 3. Status Verifikasi
- Pengujian unit smoke test menunjukkan parsing variabel `${{key}}` dan pembersihan baris kosong berfungsi 100% akurat.
- `npm run lint`: 0 error, 0 warning.
- `npm run build`: Berhasil 100% pada semua 22 rute.
