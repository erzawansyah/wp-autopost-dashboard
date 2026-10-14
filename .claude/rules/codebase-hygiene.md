# Kebersihan Codebase & Zero Dead Code

## 1. Zero Dead Code
- Saat sebuah komponen, route, interface, tool, atau prompt digantikan, hapus versi lamanya dalam perubahan yang sama beserta seluruh import & referensinya. Jangan meninggalkan fosil "untuk jaga-jaga".
- Jangan menambah shim kompatibilitas baru tanpa alasan tertulis; shim yang ada (mis. `src/core/writer/presets/registry.ts`) dihapus begitu pemakainya habis.
- Konfigurasi juga termasuk: entri batas/tool yang sudah tidak ada di registry harus ikut dibersihkan.

## 2. Konsistensi Istilah
- Gunakan **Agent Profile** (bukan engine). Istilah "preset" hanya untuk profil bawaan yang memang bernama `preset:*`.
- Nama state antrean mengikuti 9-state di `PRD.md` §4: `queued_input`, `generating_content`, `ready_to_sync`, `syncing_to_wp`, `published_on_wp`, `scheduled_on_wp`, `saved_draft_on_wp`, `failed_generation`, `failed_sync`. Jangan membuat state baru tanpa memperbarui dokumen.

## 3. TypeScript Strict
- `strict: true` wajib lolos. Dilarang `any` tanpa komentar alasan teknis di baris yang sama; utamakan `unknown` + narrowing.
- Dilarang `@ts-ignore`; `@ts-expect-error` hanya dengan alasan tertulis.

## 4. Verifikasi Sebelum Menyatakan Selesai
```bash
npx tsc --noEmit       # wajib bersih
npm run lint           # bisa > 2 menit, beri timeout longgar
```
Jika `.workspaces/scripts/audit-codebase.ts` tersedia di mesin lokal, jalankan juga `npx tsx .workspaces/scripts/audit-codebase.ts` (orphan file, prompt hardcode, istilah legacy).

## 5. Sandbox `.workspaces/` (lokal, di-ignore Git)
Dilarang menaruh skrip ad-hoc, dump, atau mock di root repo.
- `.workspaces/scripts/` — skrip reusable, wajib header dokumentasi & terdaftar di `scripts/README.md`; kredensial dibaca dari `.env`.
- `.workspaces/temp/` — scratch sekali pakai, hapus setelah selesai.
- `.workspaces/assets/` — fixture uji (CSV/Excel batch, gambar contoh).
- `.workspaces/worklogs/` — catatan progres detail per fase.
