---
name: "get-categories"
type: "tool"
description: "Tool untuk mengambil seluruh kategori WordPress beserta name, slug, id, dan description."
category: "wordpress"
author: "Antigravity Team"
version: "1.0.0"
---

# Tool: get_categories

## 1. Ikhtisar & Tujuan
`get_categories` adalah Universal Tool untuk mengambil daftar seluruh kategori yang ada pada website WordPress target melalui endpoint WP REST API standar `/wp-json/wp/v2/categories`. Tool ini mengembalikan `id`, `name`, `slug`, dan `description` agar node pemroses taksonomi atau LLM dapat mencocokkan artikel ke kategori yang paling relevan berdasarkan deskripsi semantiknya.

## 2. Struktur I/O (Input & Output)

### Input Interface (`GetCategoriesParams`)
- `baseUrl` (`string`): URL dasar website WordPress (e.g. `https://myblog.com`).
- `username` (`string`): Username akun WordPress dengan hak akses minimal Author/Editor.
- `applicationPassword` (`string`): Password aplikasi WordPress (plaintext hasil dekripsi server).

### Output Interface (`GetCategoriesResult`)
- `ok` (`boolean`): Indikator status keberhasilan HTTP request.
- `categories` (`WPCategoryDetail[]`): Daftar kategori dengan properti `id`, `name`, `slug`, `description`, `count`, dan `parent`.
- `error` (`string`, opsional): Pesan kegagalan jika request tidak berhasil.

## 3. Logika & Alur Kerja
1. Memvalidasi dan menormalisasi URL WordPress menggunakan `normalizeAndValidateWpUrl`.
2. Melakukan request HTTP GET ke endpoint `${baseUrl}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,description,count,parent`.
3. Mengotentikasi request menggunakan Basic Auth via `makeAuthHeader`.
4. Melakukan sanitasi karakter HTML entity pada `name` dan `description` (`&amp;` -> `&`).
5. Mengembalikan array objek kategori terstruktur.

## 4. Keamanan & Sanitasi
- Proteksi SSRF aktif melalui verifikasi hostname dan larangan request IP lokal/privat pada mode produksi.
- Timeout otomatis 12 detik menggunakan `AbortController` untuk mencegah hanging request.
- Kredensial tidak pernah di-log ke console atau disimpan ke client state.

## 5. Integrasi & Contoh Penggunaan
```typescript
import { getCategories } from "@/core/shared/tools/get-categories"

const result = await getCategories({
  baseUrl: "https://myblog.com",
  username: "editor_user",
  applicationPassword: "xxxx xxxx xxxx xxxx",
})

if (result.ok) {
  console.log("Kategori WordPress:", result.categories)
}
```

## 6. Riwayat Perubahan (Changelog)
- **v1.0.0 (2026-09-26)**: Rilis awal tool `get_categories` dengan dukungan deskripsi kategori lengkap.
