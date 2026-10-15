---
name: panitera-page
description: Resep membuat atau merombak halaman dasbor Panitera (src/app/(dashboard)/**, src/app/(auth)/**) — penempatan route group, Server Component sebagai default (baca data dengan requireSession + service), organism client untuk interaksi, TanStack Query via apiFetch + queryKeys, form react-hook-form + skema zod bersama dari src/lib/validation, toast notify, konfirmasi useConfirm, state loading/error/empty, token desain (tanpa palet mentah / px arbitrer), checklist aksesibilitas, dan cara menurunkan allowlist audit. Gunakan setiap kali menambah, memecah, atau merombak page.tsx, organism halaman, atau form.
---

# Panitera — Resep Halaman Dasbor

Fondasi Fase 4: route group `(auth)`/`(dashboard)`, `src/proxy.ts`, `AppProviders`, `src/lib/api`, `src/lib/validation`,
`src/lib/ui`. Baca juga `.claude/rules/page-layout-standard.md`, `.claude/rules/atomic-design-and-styling.md`, DESIGN.md §4–5.
Next.js 16 berbeda dari data latih — cek `node_modules/next/dist/docs/` sebelum memakai API Next yang belum ada di repo.

## 1. Penempatan

| Berkas | Lokasi |
| :--- | :--- |
| Halaman dasbor | `src/app/(dashboard)/<rute>/page.tsx` — shell (sidebar + navbar) & cek sesi sudah di `(dashboard)/layout.tsx` |
| Halaman masuk/daftar | `src/app/(auth)/<rute>/page.tsx` |
| Loading / error / 404 khusus rute | `loading.tsx` (pakai `PageSkeleton`), `error.tsx` (pakai `RouteErrorState`), `not-found.tsx` di folder rute. Default grup sudah ada di `(dashboard)/`. |
| Blok UI fitur | `src/components/organisms/<fitur>/*.tsx` (mis. `organisms/sites/sites-table.tsx`) |
| Query options domain | `src/lib/api/queries/<domain>.ts` (contoh: `queries/sites.ts`) |
| Skema form/body | `src/lib/validation/<domain>.ts` (murni zod; contoh: `sites.ts`, `auth.ts`) |
| Tipe domain | `src/types/<domain>.ts` (`Site`, `QueueItem`, `PostListItem`, `Batch`, `PostItemState`, …) — jangan mendefinisikan ulang interface lokal |

`page.tsx` hanya orkestrator **≤ ~200 baris**: ambil data, render `PageContainer` + `PageHeader` + organism. URL tidak
boleh berubah (route group tidak masuk URL). Jangan membungkus halaman dengan shell/wrapper sendiri.

## 2. Server Component dulu

Default `page.tsx` = Server Component (tanpa `"use client"`). Data milik pengguna yang hanya dibaca → ambil langsung di RSC
dengan client sesi + service (RLS aktif, tanpa HTTP ke `/api`):

```tsx
// src/app/(dashboard)/sites/page.tsx
import { Globe } from "lucide-react"
import { PageHeader } from "@/components/molecules/page-header"
import { PageContainer } from "@/components/templates/page-container"
import { SitesTable } from "@/components/organisms/sites/sites-table"
import { ConnectSiteButton } from "@/components/organisms/sites/connect-site-button"
import { requireSession } from "@/lib/auth/session"
import { listSites } from "@/server/services/sites"

export const metadata = { title: "Daftar Website" } // → "Daftar Website | Panitera"

export default async function SitesPage() {
  const { supabase, user } = await requireSession() // React cache: dipakai bersama layout, 1× getUser()
  const sites = await listSites(supabase, user.id)
  return (
    <PageContainer>
      <PageHeader title="Daftar Website WordPress" description="…" icon={Globe} actions={<ConnectSiteButton />} />
      <SitesTable initialSites={sites} />
    </PageContainer>
  )
}
```

- `"use client"` hanya di organism interaktif (state, event handler, TanStack Query, form). Props ke client harus
  dapat diserialisasi: data polos, bukan fungsi/komponen. `PageHeader`, `PageContainer`, `EmptyState`, `Badge`, `Button`
  aman dirender dari RSC (oper `icon={IkonLucide}` hanya ke komponen non-client).
- `searchParams`/`params` di page: `{ searchParams: Promise<Record<string, string | string[] | undefined>> }` lalu
  `await` (jangan pakai tipe global `PageProps` — belum ada saat `typecheck` CI tanpa build).
- Data tidak ada / bukan milik pengguna → `notFound()` dari `next/navigation` (render `not-found.tsx` di dalam shell).
- Jangan pernah `createAdminClient()` di page; jangan `fetch("/api/...")` dari RSC.
- Gate fitur (mis. Developer Mode `/lab`): cek di server (`hasLabAccess(supabase, user)` → `redirect("/")`/`notFound()`).

## 3. Data di client: TanStack Query + `apiFetch`

```tsx
"use client"
const queryClient = useQueryClient()
const confirm = useConfirm()
const { data: sites = [], isPending, error } = useQuery({ ...sitesQueries.list(), initialData: initialSites })

const deleteSite = useMutation({
  mutationFn: (id: string) => apiFetch(`/api/sites/${id}`, { method: "DELETE" }),
  onSuccess: async () => {
    notify.success("Website berhasil dihapus.")
    // Hapus situs mengkaskade item & batch → invalidasi semua domain terdampak.
    await Promise.all(
      [queryKeys.sites.all, queryKeys.posts.all, queryKeys.queue.all, queryKeys.batches.all].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey })
      )
    )
  },
  onError: (err) => notify.error(err, { fallback: "Gagal menghapus website." }),
})

async function handleDelete(site: Site) {
  const ok = await confirm({
    title: `Hapus website "${site.site_name}"?`,
    description: "Antrean artikel yang tersambung ke website ini ikut terhapus.",
    tone: "destructive",
  })
  if (ok) deleteSite.mutate(site.id)
}
```

- `apiFetch<T>(path, { method, body, query, signal })` (`@/lib/api/client`): body objek → JSON, mengembalikan data tanpa `ok`,
  melempar `ApiClientError { status, code, message, issues?, payload? }` dengan pesan Indonesia. Teruskan `signal` dari
  `queryFn` (`({ signal }) => apiFetch(..., { signal })`). Dilarang `fetch()` mentah / `useEffect + fetch` di komponen.
- Key hanya dari `queryKeys` (`@/lib/api/query-keys`); query options per domain di `src/lib/api/queries/<domain>.ts` dengan
  `queryOptions()`. Tambah key baru hanya di blok domain milik Anda.
- Default global (`@/lib/api/query-client`): `staleTime` 30 dtk, retry hanya jaringan/5xx (maks 2), mutation tanpa retry,
  401 → otomatis ke `/login?next=…`. Polling status antrean: `refetchInterval: (q) => (adaItemAktif(q.state.data) ? 5000 : false)`.
- Data awal dari RSC: `initialData` (atau pola `HydrationBoundary` di docs Next `client-side-data-fetching/tanstack-query`).
- Optimistic update hanya bila nilai akhirnya pasti; selalu rollback di `onError`.
- Keluar akun: `queryClient.clear()` (sudah di `TopNavbar`); jangan simpan data tenant di modul global.

## 4. Form: react-hook-form + zod bersama

```tsx
const form = useZodForm(CreateSiteBodySchema, {
  defaultValues: { site_name: "", base_url: "", wp_username: "", app_password: "" }, // wajib semua field
})
const createSite = useMutation({
  mutationFn: (values: CreateSiteInput) => apiFetch<{ site: CreatedSite; message: string }>("/api/sites", { method: "POST", body: values }),
  onSuccess: ({ message }) => { notify.success(message); form.reset(); return queryClient.invalidateQueries({ queryKey: queryKeys.sites.all }) },
  onError: (err) => { if (!applyApiIssues(form, err)) notify.error(err) },
})

<form noValidate onSubmit={form.handleSubmit((values) => createSite.mutate(values))}>
  <FieldGroup className="gap-4">
    <ControlledField control={form.control} name="base_url" label="Alamat website" required hint="Contoh: https://blogku.com">
      {(field) => <Input {...field} type="url" autoComplete="url" />}
    </ControlledField>
    <ControlledField control={form.control} name="role" label="Peran">
      {({ value, onChange, id, ...aria }) => (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} aria-invalid={aria["aria-invalid"]} aria-describedby={aria["aria-describedby"]}>…</SelectTrigger>
        </Select>
      )}
    </ControlledField>
  </FieldGroup>
  <Button type="submit" disabled={createSite.isPending}>Simpan</Button>
</form>
```

- Skema dari `src/lib/validation/<domain>.ts` — sumber yang sama dengan route API (pesan error identik). Belum ada untuk
  domain Anda? Pindahkan skema body murni dari `src/server/validation/<domain>.ts` ke `src/lib/validation/<domain>.ts`
  (route & service mengimpor dari sana); yang butuh modul server (ToolRegistry, klien WordPress, `parseWebhookEvents`,
  validasi anti-SSRF) tetap di server dan `.extend()`/`.superRefine()` skema dasar. Tambahan khusus form (mis. konfirmasi
  sandi) → `XFormSchema = XBodySchema.extend(...)` di `lib/validation`.
- `ControlledField` (`molecules/controlled-field`) mengisi label, hint, tooltip, error zod, `aria-invalid`,
  `aria-describedby`, `aria-required`. Form lama tanpa RHF memakai `FormField` presentasional (API sama).
- Error 400 `validation_failed` → `applyApiIssues(form, err)` memasang pesan ke field; selain itu `notify.error(err)`.
- Rujukan hidup: `src/components/organisms/auth/login-form.tsx` & `register-form.tsx`.

## 5. Umpan balik & state

| Kebutuhan | Pakai |
| :--- | :--- |
| Notifikasi hasil aksi | `notify.success/error/info/warning/promise` (`@/lib/ui/notify`) — **bukan** `alert()` |
| Konfirmasi | `const confirm = useConfirm()` (`@/lib/ui/confirm`) → `await confirm({ title, description, tone })` — **bukan** `confirm()` |
| Callout inline | atom `Alert` (`variant`: default/destructive/success/warning/info/ai) |
| Loading halaman | `loading.tsx` → `<PageSkeleton />`; di organism: `Skeleton` (bukan spinner layar penuh) |
| Loading aksi | `disabled={mutation.isPending}` + ikon `Loader2` di tombol |
| Error halaman | `error.tsx` → `<RouteErrorState error retry />` (tanpa `error.message`/stack) |
| Error query di organism | `Alert variant="destructive"` + tombol "Coba lagi" (`refetch()`) |
| Kosong | `EmptyState` (aksi lewat `children`: `<Button>`/`<Button asChild><Link/></Button>`) |

## 6. Token, bukan nilai mentah (dicek `npm run audit:hygiene`)

| Pola lama | Ganti dengan |
| :--- | :--- |
| `text-emerald-600 dark:text-emerald-400` | `text-success-strong` |
| `bg-emerald-50 dark:bg-emerald-950/40`, `bg-emerald-500/15` | `bg-success/10` |
| `border-emerald-200`, `border-emerald-500/30` | `border-success/30` |
| `bg-emerald-500` (dot, bar) | `bg-success` (+ `text-success-foreground` bila ada teks di atasnya) |
| amber / yellow / orange | `warning` (`text-warning-strong`, `bg-warning/10`, `bg-warning`) |
| sky / blue / cyan / teal | `info` |
| purple / violet / indigo | `ai-process` |
| rose / red | `destructive` (`text-destructive-strong` untuk teks di atas tint) |
| slate / gray / zinc | `muted`, `muted-foreground`, `secondary`, `foreground/80`, `border` |
| `text-[9px]`, `text-[10px]`, `text-[10.5px]` | `text-2xs` (hanya label mikro: counter, kbd, overline mono, versi) |
| `text-[11px]`, `text-[12px]` | `text-xs` (kalimat, hint, badge status, meta) |
| `text-[13px]` | `text-sm` |

Warna/ukuran baru → token di `globals.css` (terang **dan** gelap) + DESIGN.md, bukan nilai mentah.

## 7. Aksesibilitas (wajib)

- Tidak ada `div`/`span` yang bisa diklik: navigasi → `Link`, aksi → `button`/`Button`. Baris tabel yang bisa dibuka →
  `Link` di sel judul, bukan `onClick` pada `<tr>`.
- Tombol ikon saja wajib `aria-label` (ikon dekoratif `aria-hidden="true"`); `title` bukan pengganti label.
- Setiap input punya label (`ControlledField`/`FormField` + `id`); placeholder bukan label. Grup checkbox/radio → `FieldSet` + `FieldLegend`.
- Fokus terlihat (`focus-visible:ring-2 ring-ring`), urutan Tab logis, Esc menutup dialog (Radix sudah menangani).
- Pesan dinamis: error `role="alert"`, status/progres `role="status"`; animasi berputar/berdenyut + `motion-reduce:animate-none`.
- Satu `h1` per halaman (dari `PageHeader`); hierarki heading berurutan.
- Kontras: pakai token `*-strong` untuk teks berwarna peran di atas `bg-*/10`.

## 8. Menurunkan allowlist audit (ratchet)

`scripts/audit-allowlist.json` memuat jumlah temuan per berkas (`raw-palette-color`, `arbitrary-text-size`,
`browser-dialog`, `legacy-term`, …) dengan reason "Fase 4: diturunkan saat halaman dirombak".

1. Rombak berkas → `npm run audit:hygiene`. Catatan "temuan turun ke N — turunkan max" → ubah `max` ke N;
   "tidak ada temuan lagi" → hapus entrinya. Target setiap berkas yang Anda sentuh: **0**.
2. Jangan menaikkan `max` atau menambah entri untuk berkas baru — berkas baru harus bersih sejak awal.
3. Berkas dipindah/dipecah → perbarui `file` di entri (jumlah hanya boleh sama/turun), pecahan baru tanpa entri.
4. `node scripts/audit-codebase.ts --strict` untuk memastikan tidak ada entri basi sebelum melapor.

## 9. Berkas fondasi bersama (koordinasikan sebelum mengubah)

`src/proxy.ts`, `src/lib/auth/*`, `src/lib/api/{client,contract,query-client,query-keys}.ts`, `src/lib/ui/*`,
`src/lib/hooks/{use-zod-form,use-theme}.ts`, `src/components/providers/*`, `src/components/templates/*`, `src/app/layout.tsx`,
`src/app/(dashboard)/{layout,loading,error,not-found}.tsx`, `src/app/globals.css`, atom (`src/components/atoms/*`), molekul
fondasi (`form-field`, `controlled-field`, `empty-state`, `confirm-dialog`, `page-header`, `help-tooltip`, `mode-toggle`),
shell (`sidebar-nav`, `top-navbar`). Butuh perubahan → varian/prop kecil yang kompatibel, atau ajukan ke pemilik fondasi.

## 10. Selesai

Jalankan skill `panitera-verify` (typecheck, lint 0 warning, test, audit, build). Tambah test untuk logika murni baru
(helper, `select`, mapper) di `*.test.ts`. Perbarui ARCHITECTURE.md bila struktur/rute berubah.
