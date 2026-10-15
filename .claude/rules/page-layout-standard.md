---
paths:
  - "src/app/**/page.tsx"
  - "src/app/**/layout.tsx"
  - "src/components/templates/**"
  - "src/components/molecules/page-header.tsx"
---

# Standar Struktur Halaman (`PageContainer` + `PageHeader`)

Shell dasbor (sidebar + top navbar) dirender **sekali** oleh `src/app/(dashboard)/layout.tsx` lewat template
`DashboardShell` (`src/components/templates/dashboard-shell.tsx`) setelah sesi diverifikasi di server. Halaman di route
group `(dashboard)` **tidak** membungkus dirinya dengan shell/layout apa pun — cukup merender:

```tsx
<PageContainer>                     {/* src/components/templates/page-container.tsx */}
  <PageHeader                        {/* src/components/molecules/page-header.tsx */}
    title="Judul Halaman"
    description="Satu kalimat tujuan halaman."
    icon={IconLucide}
    actions={<Button>Aksi Utama</Button>}
  />
  {/* organism-organism halaman */}
</PageContainer>
```

- Halaman dasbor baru → `src/app/(dashboard)/<rute>/page.tsx`; halaman masuk/daftar → `src/app/(auth)/<rute>/page.tsx`.
  Route group tidak mengubah URL. Resep lengkap (RSC, data, form, state): skill `panitera-page`.
- `PageContainer` default `max-w-7xl mx-auto w-full`. Varian `size="narrow"` (`max-w-4xl`) untuk form/teks panjang, `size="full"` hanya untuk tabel sangat lebar.
- `PageHeader` wajib mengisi `title`, `description`, dan `icon`. Tombol aksi utama halaman diletakkan di `actions` (pojok kanan atas). Halaman detail memakai `backHref`/`backLabel`; status ringkas memakai `badge`.
- `PageContainer` & `PageHeader` bukan Client Component: aman dirender langsung dari page Server Component.
- State segmen: `loading.tsx` → `PageSkeleton` (`templates/page-skeleton.tsx`), `error.tsx` → `RouteErrorState` (`organisms/route-error-state.tsx`), `not-found.tsx` → `EmptyState`. Default untuk seluruh dasbor sudah ada di `src/app/(dashboard)/`.
- Dilarang membuat wrapper (`<div className="max-w-...">`) atau header (`<h1>`) ad-hoc di halaman.
- Selector situs ringkas untuk WP Tools ditaruh di `PageHeader.actions`, bukan di baris terpisah.
- Pengecualian hanya untuk halaman `(auth)` (`/login`, `/register`) yang berada di luar shell dasbor.
