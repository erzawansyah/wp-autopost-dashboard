---
name: panitera-verify
description: Urutan verifikasi wajib di repo Panitera sebelum menyatakan pekerjaan selesai (typecheck, lint tanpa warning, Vitest + test DB PGlite, audit kebersihan, next build), cara menangani kegagalan, kapan menambah test, dan aturan commit/push. Gunakan setiap kali selesai mengubah kode, sebelum melapor "selesai", atau sebelum meminta izin commit.
---

# Panitera — Verifikasi Sebelum "Selesai"

Sama dengan job CI (`.github/workflows/ci.yml`; CI juga menjalankan `npm audit --omit=dev --audit-level=critical` dan build image Docker). Jangan menyatakan selesai sebelum semua langkah lulus.

## Urutan

Jalankan dari root repo (Node 22, dependensi via `npm ci`), berurutan, berhenti di langkah pertama yang gagal:

```bash
npm run typecheck                  # tsc --noEmit, strict
npm run lint -- --max-warnings=0   # warning juga gagal (bisa > 2 menit)
npm test                           # Vitest: src/**/*.test.ts + supabase/tests (PGlite, tanpa Docker)
npm run audit:hygiene              # scripts/audit-codebase.ts
npm run build                      # next build
```

- `npm run build` butuh `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Bila `.env.local` tidak ada, pakai placeholder seperti CI: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy npm run build`. Jangan membaca atau menulis berkas `.env*`.
- Hanya mengubah dokumen/Markdown → typecheck/lint/test/build boleh dilewati; sebutkan itu di laporan.
- Mengubah migrasi atau RLS → `npm run db:test` dulu untuk umpan balik cepat (tetap jalankan urutan penuh).

### Opsional: E2E (wajib lulus di CI, job `e2e`)

```bash
npm run test:e2e   # Playwright: Supabase lokal (Docker) + WordPress Playground + next dev
```

- Jalankan bila menyentuh alur yang diuji `e2e/tests/` (auth, situs, Tulis Cepat/antrean, publikasi ke WordPress, kunci BYOK) atau runner/migrasi. Butuh Docker berjalan dan port `54321`, `9400`, `3100` bebas; tidak boleh ada `next dev` lain di checkout yang sama.
- Supabase lokal dibiarkan berjalan setelahnya (`npx supabase stop` untuk mematikan). Log layanan, trace, dan laporan HTML ada di `E2E_OUTPUT_DIR` (default `<tmp>/panitera-e2e`). Detail: README § Test End-to-End.
- Browser uji tidak menerima pesan reload/update HMR `next dev` (`e2e/support/ui.ts`), tetapi edit berkas saat suite berjalan tetap terpakai di halaman berikutnya → hasil run campuran; hindari mengedit selama run.

## Saat Gagal

- Perbaiki **akar masalah**. Dilarang `@ts-ignore`, `any` tanpa alasan, `eslint-disable` tanpa komentar alasan, `.skip`/`.only` di test, atau melemahkan assertion agar hijau.
- Test gagal di area yang tidak Anda sentuh: jalankan ulang sekali untuk memastikan bukan flaky, lalu laporkan ke pengguna — jangan "memperbaiki" kode orang lain diam-diam.
- `audit:hygiene` gagal: hapus kode mati, pindahkan prompt ke `src/core/shared/prompts/*.md`, pakai istilah **Agent Profile**, token warna `globals.css` (bukan palet mentah `text-emerald-600`; DESIGN.md §4), skala tipografi resmi (bukan `text-[11px]`; DESIGN.md §5), `notify`/`useConfirm` (bukan `alert()`/`confirm()`), dan `safeFetch()`/`wpFetch` untuk URL dari pengguna/LLM. Entri baru di `scripts/audit-allowlist.json` hanya bila memang disengaja, wajib `reason` jelas dan disetujui pengguna. Jika temuan berkurang, turunkan `max` entri terkait.
- Build gagal karena API Next.js: baca panduan di `node_modules/next/dist/docs/` (Next 16 berbeda dari data latih).

## Kapan Menambah Test

- **Setiap bug yang diperbaiki** → test regresi yang gagal sebelum perbaikan (`*.test.ts` di sebelah modulnya).
- Logika murni baru (parser, formatter, scheduler, guard, validasi URL/SSRF, crypto) → unit test.
- Perubahan `safe-fetch.ts` → wajib test di `safe-fetch.test.ts`.
- Migrasi/RLS baru → test isolasi tenant di `supabase/tests/`.

## Laporan & Git

- Laporkan langkah yang dijalankan beserta hasilnya; jika ada yang dilewati atau gagal, katakan apa adanya.
- `git commit` / `git push` **hanya** atas instruksi atau persetujuan eksplisit pengguna. Jangan `--no-verify`, jangan force-push.
