# Skrip Repo (`scripts/`)

Skrip TypeScript yang dijalankan langsung oleh Node.js 22.18+ (type stripping bawaan; ESM lewat
`scripts/package.json`). Setiap skrip wajib berheader dokumentasi (`@file`, `@description`, `@prerequisites`,
`@usage`, `@output`) dan terdaftar di tabel ini. Skrip ad-hoc atau sekali pakai tetap di `.workspaces/`
(lihat `.claude/rules/codebase-hygiene.md`). Test skrip (`scripts/**/*.test.ts`) ikut `npm test`.

| Skrip | Perintah | Fungsi | Di CI |
| :--- | :--- | :--- | :--- |
| `audit-codebase.ts` (+ `audit-allowlist.json`) | `npm run audit:hygiene` | Audit kebersihan: berkas yatim, prompt (memakai validasi `build-prompts.ts`), prompt hardcode, istilah legacy, warna arbitrer, raw fetch. | Ya |
| `build-prompts.ts` | `npm run prompts:build` (otomatis `prebuild`) | Validasi `src/core/shared/prompts/*.md` lalu generate `registry.generated.ts` yang dibundel Next.js. `-- --check`: gagal bila registry basi tanpa menulis. | Tidak langsung: `registry.test.ts` (di `npm test`) gagal bila registry basi/invalid |
| `eval-writer.ts` | `npm run eval:writer` | Eval live `writer.run()` atas `evals/cases/*.json` dengan penilaian deterministik; laporan ke `.workspaces/evals/<timestamp>/`. | Tidak (memanggil LLM berbayar) |

## Alur mengubah prompt

1. Edit/tambah `src/core/shared/prompts/<pilar>-<nama>.md` (format: `.claude/rules/prompt-management.md`; aturan
   validasi lengkap di header `build-prompts.ts`).
2. `npm run prompts:build` — memvalidasi dan menulis ulang `registry.generated.ts` (commit hasilnya).
3. `UPDATE_GOLDEN=1 npx vitest run src/core/shared/prompts/golden.test.ts` — perbarui golden prompt terender,
   lalu tinjau diff `src/core/shared/prompts/__golden__/*.golden.txt` di PR.
4. Opsional, untuk perubahan prompt/model yang berdampak ke kualitas naskah:
   `EVAL_OPENROUTER_API_KEY=… npm run eval:writer` sebelum & sesudah perubahan, bandingkan `report.md`.

`prebuild` menjalankan `prompts:build` agar `next build`/image Docker selalu membundel isi `.md` terbaru;
`pretest` sengaja tidak, supaya `registry.test.ts` tetap menangkap registry yang lupa diregenerasi di CI.

## Eval writer

```bash
npm run eval:writer -- --dry-run                       # tanpa kunci & jaringan: bukti plumbing + penilaian
EVAL_OPENROUTER_API_KEY=… npm run eval:writer          # live, seluruh kasus
EVAL_OPENROUTER_API_KEY=… npm run eval:writer -- --model <openrouter-model-id> --case deep-umkm-qris --timeout 900
```

- Kunci hanya dari environment shell (`EVAL_OPENROUTER_API_KEY`; opsional `EVAL_TAVILY_API_KEY`,
  `EVAL_BRAVE_API_KEY`, `EVAL_SERPAPI_API_KEY`, `EVAL_PEXAFY_API_KEY`). Skrip tidak membaca `.env` dan menyamarkan
  kunci dari seluruh keluaran.
- Tanpa kredensial WordPress dan tanpa userId: tool WP tidak eligible, tidak ada request ke WordPress/Supabase.
- Kasus: `evals/cases/<id>.json` (`id` = nama berkas; skema `EvalCaseSchema` di `evals/scoring.ts`).
- Penilaian (`evals/scoring.ts`, diuji di CI): sukses, kata vs target, jumlah H2, tanpa H1/byline/sitasi,
  Markdown murni, `contentHtml` aman & blok Gutenberg berpasangan, panjang judul/excerpt, heuristik bahasa,
  token/durasi/biaya. Laporan memuat versi prompt yang dimuat setiap kasus.

## Konvensi impor antar-skrip

Node butuh path `.ts` persis, sedangkan `tsc` (tanpa `allowImportingTsExtensions`) menolak impor statis berakhiran
`.ts`. Pakai `import type * as X from "./modul"` untuk tipe dan impor dinamis
`await import(new URL("./modul.ts", import.meta.url).href)` untuk nilai (contoh: `audit-codebase.ts`). Kode yang
butuh alias `@/` dimuat lewat Vite SSR seperti `eval-writer.ts`.
