---
name: "get-author"
type: "tool"
description: "Tool untuk mengambil daftar penulis dari WordPress beserta author_id, author_name, dan author_bio."
category: "wordpress"
author: "Antigravity Team"
version: "1.0.0"
---

# Tool: get_author

## 1. Ikhtisar & Tujuan
`get_author` adalah Universal Tool untuk mengambil data seluruh pengguna/penulis dari WordPress melalui endpoint `/wp-json/wp/v2/users`. Tool ini mengekstraksi `author_id`, `author_name`, dan `author_bio` (berasal dari field `description` profil WP) yang memungkinkan AI mencocokkan kapasitas, persona, dan gaya penulis dengan topik artikel yang sedang dibuat.

## 2. Struktur I/O (Input & Output)

### Input Interface (`GetAuthorParams`)
- `baseUrl` (`string`): URL dasar website WordPress target.
- `username` (`string`): Username akun WordPress pengguna.
- `applicationPassword` (`string`): Password aplikasi WordPress.

### Output Interface (`GetAuthorResult`)
- `ok` (`boolean`): Status keberhasilan request.
- `authors` (`WPAuthorDetail[]`): Daftar penulis dengan properti:
  - `author_id` (`number`): ID numerik user WordPress.
  - `author_name` (`string`): Nama publik penulis.
  - `author_bio` (`string`): Biografi ringkas penulis dari profil WordPress.
  - `slug` (`string`): Slug username penulis.
- `error` (`string`, opsional): Pesan kegagalan jika terjadi kendala jaringan/otentikasi.

## 3. Logika & Alur Kerja
1. Normalisasi URL WordPress target dan validasi anti-SSRF.
2. Melakukan request HTTP GET ke endpoint `${baseUrl}/wp-json/wp/v2/users?per_page=100&_fields=id,name,slug,description`.
3. Memetakan field `id` -> `author_id`, `name` -> `author_name`, dan `description` -> `author_bio`.
4. Mengembalikan daftar profil penulis terstruktur.

## 4. Keamanan & Sanitasi
- Proteksi SSRF aktif melalui verifikasi hostname.
- Sanitasi entitas HTML karakter khusus.
- Kredensial diproses murni di server-side.

## 5. Integrasi & Contoh Penggunaan
```typescript
import { getAuthor } from "@/core/shared/tools/get-author"

const result = await getAuthor({
  baseUrl: "https://myblog.com",
  username: "admin_user",
  applicationPassword: "xxxx xxxx xxxx xxxx",
})

if (result.ok) {
  console.log("Penulis WordPress:", result.authors)
  // Output: [{ author_id: 1, author_name: "Budi Santoso", author_bio: "Praktisi arsitektur dan interior...", slug: "budi" }]
}
```

## 6. Riwayat Perubahan (Changelog)
- **v1.0.0 (2026-09-26)**: Rilis awal tool `get_author` dengan ekstraksi nama dan bio penulis.
