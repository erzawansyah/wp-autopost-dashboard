---
paths:
  - "src/app/**/page.tsx"
  - "src/components/templates/**"
  - "src/components/molecules/page-header.tsx"
---

# Standar Struktur Halaman (`PageContainer` + `PageHeader`)

Setiap halaman menu `src/app/**/page.tsx` wajib memakai kerangka yang sama:

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

- `PageContainer` default `max-w-7xl mx-auto w-full`. Varian `size="narrow"` (`max-w-4xl`) untuk form/teks panjang, `size="full"` hanya untuk tabel sangat lebar.
- `PageHeader` wajib mengisi `title`, `description`, dan `icon`. Tombol aksi utama halaman diletakkan di `actions` (pojok kanan atas). Halaman detail memakai `backHref`/`backLabel`; status ringkas memakai `badge`.
- Dilarang membuat wrapper (`<div className="max-w-...">`) atau header (`<h1>`) ad-hoc di halaman.
- Selector situs ringkas untuk WP Tools ditaruh di `PageHeader.actions`, bukan di baris terpisah.
- Pengecualian hanya untuk halaman non-dashboard (`/login`, `/register`) yang tidak memakai `DashboardLayout`.
