---
name: "create-tags"
type: "tool"
description: "Tool untuk membuat tag baru di WordPress jika belum ada tag yang cocok untuk artikel."
category: "wordpress"
author: "Antigravity Team"
version: "1.0.0"
---

# Tool: create_tags

## 1. Ikhtisar & Tujuan
`create_tags` adalah Universal Tool untuk memeriksa keberadaan tag pada WordPress target dan secara otomatis membuat tag baru (*on-demand creation*) apabila belum tersedia. Tool ini mencegah duplikasi tag dengan mencocokkan nama tag secara *case-insensitive* sebelum mengirim request pembuatan.

## 2. Struktur I/O (Input & Output)

### Input Interface (`CreateTagsParams`)
- `baseUrl` (`string`): URL dasar website WordPress target.
- `username` (`string`): Username akun WordPress pengguna.
- `applicationPassword` (`string`): Password aplikasi WordPress.
- `tagNames` (`string[]`): Array nama tag yang ingin dipastikan/dibuat.

### Output Interface (`CreateTagsResult`)
- `ok` (`boolean`): Status operasional.
- `tagIds` (`number[]`): Array ID numerik tag yang siap dipasangkan ke artikel.
- `tags` (`CreatedTagItem[]`): Detail setiap tag beserta flag `isNew` (apakah baru dibuat atau sudah ada sebelumnya).
- `createdCount` (`number`): Jumlah tag baru yang berhasil dibuat.
- `error` (`string`, opsional): Pesan kegagalan jika ada kendala fatal.

## 3. Logika & Alur Kerja
1. Untuk setiap string nama tag:
   - Bersihkan spasi liar (*trim*).
   - Lakukan pencarian via `GET /wp-json/wp/v2/tags?search=...`.
   - Jika ditemukan kecocokan eksak, gunakan ID yang sudah ada (`isNew: false`).
   - Jika belum ada, kirim `POST /wp-json/wp/v2/tags` dengan payload nama tag (`isNew: true`).
   - Jika WordPress merespons error `term_exists`, ekstrak ID yang tersimpan di `data.term_id`.
2. Kembalikan daftar `tagIds` numerik yang siap dikonsumsi oleh WordPress Publisher.

## 4. Keamanan & Sanitasi
- Proteksi SSRF aktif melalui verifikasi hostname.
- Isolasi error per-tag agar kegagalan satu tag tidak membatalkan tag lainnya.
- Kredensial tidak pernah bocor ke sisi client.

## 5. Integrasi & Contoh Penggunaan
```typescript
import { createTags } from "@/core/shared/tools/create-tags"

const result = await createTags({
  baseUrl: "https://myblog.com",
  username: "admin_user",
  applicationPassword: "xxxx xxxx xxxx xxxx",
  tagNames: ["renovasi dapur", "desain minimalis"],
})

console.log("Tag IDs:", result.tagIds) // [42, 43]
console.log("Jumlah tag baru:", result.createdCount)
```

## 6. Riwayat Perubahan (Changelog)
- **v1.0.0 (2026-09-26)**: Rilis awal tool `create_tags` dengan verifikasi pra-pembuatan dan penanganan `term_exists`.
