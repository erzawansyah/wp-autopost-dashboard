---
name: panitera-api-route
description: Cara menulis atau mengubah Route Handler API Panitera (src/app/api/**/route.ts) dengan defineRoute — auth sesi/cron, validasi zod untuk body/query/params, rate limit, pemetaan error Postgres (23505→409, dst.), bentuk respons standar, dan pemisahan logika ke service layer src/server/services. Gunakan setiap kali menambah, memigrasikan, atau mengubah API route.
---

# Route Handler API Panitera

Semua route memakai `defineRoute` dari `@/server/http/route`. Jangan menulis try/catch, cek sesi, atau `NextResponse.json({ error: err.message })` manual lagi.

## Template

```ts
import { z } from "zod"
import { defineRoute } from "@/server/http/route"
import { notFound, throwIfDbError } from "@/server/http/errors"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { IdParamsSchema } from "@/lib/validation/common"
import { updateSite } from "@/server/services/sites"

const UpdateSiteBody = z.object({
  site_name: z.string().trim().min(2).max(100).optional(),
  max_concurrency: z.number().int().min(1).max(10).optional(),
})

export const PATCH = defineRoute(
  { auth: "user", params: IdParamsSchema, body: UpdateSiteBody },
  async ({ supabase, user, params, body }) => {
    const site = await updateSite(supabase, user.id, params.id, body)
    return { site } // → 200 { ok: true, site }
  }
)
```

## Aturan

1. **Auth**: `"user"` (default untuk semua fitur pengguna), `"cron"` (header `Authorization: Bearer <CRON_SECRET>` atau `x-cron-secret`), `"user-or-cron"`, `"public"` (sesi opsional, mis. `auth/me`, callback OAuth), `"none"` (tanpa client Supabase sama sekali, mis. `health`).
2. **Validasi**: setiap body/query/params lewat skema zod. Skema body yang juga dipakai form client ditulis MURNI di `src/lib/validation/<domain>.ts` (hanya `zod` + modul `lib/validation`; contoh `sites.ts`, blok bangunan `common.ts`); refinement yang butuh modul server (ToolRegistry, klien WordPress, validasi anti-SSRF) dan skema khusus route (callback, query internal) tetap di `src/server/validation/<domain>.ts`, mengimpor & `.extend()` skema dari `lib/validation`. Jangan menduplikasi skema yang sama di dua tempat. Query string selalu string → pakai `z.coerce.number()` dsb. Batasi panjang string & ukuran array. Body dibatasi `maxBodyBytes` (default 1 MB → 413 `payload_too_large`); naikkan hanya bila batas skema memang lebih besar (mis. batch 500 item).
3. **Client DB**: `supabase` dari context = sesi pengguna (RLS aktif). Tetap filter `.eq("user_id", user.id)` (defense in depth). `createAdminClient()` hanya untuk proses sistem dan wajib filter `user_id` eksplisit.
4. **Error**: lempar `ApiError` (`badRequest`, `notFound`, `conflict`, `unprocessable`, `forbidden`, `payloadTooLarge`, `upstreamFailed`) atau `throwIfDbError(error)` setelah query Supabase. Pemetaan otomatis: 23505→409, 23503/23514/23502→422, 22P02→400, 42501→403, ZodError→400, `SsrfBlockedError`→400. Jangan pernah mengirim `error.message` dari DB/library ke client.
5. **Respons**: kembalikan objek (dibungkus `{ ok: true, ... }`). Error selalu `{ ok: false, error, code, issues? }`. Saat memigrasikan route lama, **pertahankan nama field sukses** yang dibaca client (cari pemanggil dengan `grep -rn "/api/<path>" src/app src/components src/lib`).
6. **Rate limit**: `RATE_LIMITS.llm` untuk endpoint yang memanggil LLM, `RATE_LIMITS.outboundTest` untuk uji koneksi keluar, `RATE_LIMITS.enqueue` untuk pembuatan job, `RATE_LIMITS.credentialChange` untuk verifikasi/ganti kredensial akun.
7. **Service layer**: logika bisnis (lebih dari query sederhana) di `src/server/services/<domain>.ts` dengan signature `(supabase, userId, ...)`; route tetap tipis. Service tidak mengimpor `next/server`.
8. **Fetch keluar**: URL dari pengguna/LLM wajib `safeFetch`/`wpFetch` (lihat `.claude/rules/security.md`).
9. **Antrean**: route tidak pernah memproses job di dalam request. Catat/jadwalkan ulang item di database lalu bangunkan runner (`src/server/queue`); kembalikan state baru (mis. 202 untuk aksi ulang).
10. **Test**: tambah `route.test.ts` di sebelah route untuk perilaku penting (auth, validasi, kepemilikan, konflik). Mock `@/lib/supabase/server` seperti `src/server/http/route.test.ts`.
11. **Dokumentasi**: perbarui katalog API di `ARCHITECTURE.md` §9 bila method/path berubah.

Contoh lengkap: `src/app/api/sites/[id]/route.ts`. Verifikasi akhir: skill `panitera-verify`.
