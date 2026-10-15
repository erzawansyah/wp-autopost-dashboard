---
name: panitera-verify
description: Urutan verifikasi wajib di repo Panitera sebelum menyatakan pekerjaan selesai (typecheck, lint tanpa warning, Vitest + test DB PGlite, audit kebersihan, next build), cara menangani kegagalan, kapan menambah test, dan aturan commit/push. Gunakan setiap kali selesai mengubah kode, sebelum melapor "selesai", atau sebelum meminta izin commit.
---

# Panitera — Verifikasi Sebelum "Selesai"

Sama persis dengan job CI (`.github/workflows/ci.yml`). Jangan menyatakan selesai sebelum semua langkah lulus.

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

## Saat Gagal

- Perbaiki **akar masalah**. Dilarang `@ts-ignore`, `any` tanpa alasan, `eslint-disable` tanpa komentar alasan, `.skip`/`.only` di test, atau melemahkan assertion agar hijau.
- Test gagal di area yang tidak Anda sentuh: jalankan ulang sekali untuk memastikan bukan flaky, lalu laporkan ke pengguna — jangan "memperbaiki" kode orang lain diam-diam.
- `audit:hygiene` gagal: hapus kode mati, pindahkan prompt ke `src/core/shared/prompts/*.md`, pakai istilah **Agent Profile**, token warna `globals.css`, dan `safeFetch()`/`wpFetch` untuk URL dari pengguna/LLM. Entri baru di `scripts/audit-allowlist.json` hanya bila memang disengaja, wajib `reason` jelas dan disetujui pengguna. Jika temuan berkurang, turunkan `max` entri terkait.
- Build gagal karena API Next.js: baca panduan di `node_modules/next/dist/docs/` (Next 16 berbeda dari data latih).

## Kapan Menambah Test

- **Setiap bug yang diperbaiki** → test regresi yang gagal sebelum perbaikan (`*.test.ts` di sebelah modulnya).
- Logika murni baru (parser, formatter, scheduler, guard, validasi URL/SSRF, crypto) → unit test.
- Perubahan `safe-fetch.ts` → wajib test di `safe-fetch.test.ts`.
- Migrasi/RLS baru → test isolasi tenant di `supabase/tests/`.

## Laporan & Git

- Laporkan langkah yang dijalankan beserta hasilnya; jika ada yang dilewati atau gagal, katakan apa adanya.
- `git commit` / `git push` **hanya** atas instruksi atau persetujuan eksplisit pengguna. Jangan `--no-verify`, jangan force-push.
