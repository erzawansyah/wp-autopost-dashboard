---
name: "get-tags"
type: "tool"
description: "Tool untuk mengambil seluruh tag WordPress dan mengembalikannya sebagai string padat hemat token (tag1 (23), tag2 (40))."
category: "wordpress"
author: "Antigravity Team"
version: "1.0.0"
---

# Tool: get_tags

## 1. Ikhtisar & Tujuan
`get_tags` adalah Universal Tool untuk mengambil daftar tag dari WordPress via WP REST API dan menyajikannya dalam format string yang sangat hemat token: `tag1 (id1), tag2 (id2), ...`. Format ini dirancang khusus untuk diinjeksikan langsung ke dalam context prompt LLM tanpa memboroskan kuota token dengan struktur JSON yang berulang.

## 2. Struktur I/O (Input & Output)

### Input Interface (`GetTagsParams`)
- `baseUrl` (`string`): URL dasar website WordPress target.
- `username` (`string`): Username akun WordPress pengguna.
- `applicationPassword` (`string`): Password aplikasi WordPress.
- `perPage` (`number`, opsional): Jumlah tag per request (default: 100).

### Output Interface (`GetTagsResult`)
- `ok` (`boolean`): Status keberhasilan request.
- `tagsString` (`string`): String ringkas hemat token (contoh: `"resep (12), masakan (15), kuliner (23)"`).
- `tags` (`WPTagItem[]`): Array objek tag `{ id, name }`.
- `totalCount` (`number`): Jumlah tag yang berhasil dimuat.
- `error` (`string`, opsional): Pesan kesalahan jika request gagal.

## 3. Logika & Alur Kerja
1. Normalisasi URL WordPress target dan verifikasi SSRF.
2. Memanggil endpoint `${baseUrl}/wp-json/wp/v2/tags?per_page=100&_fields=id,name`.
3. Melakukan sanitasi entitas nama tag (`&amp;` -> `&`).
4. Menggabungkan nama dan ID menjadi format ringkas: `${name} (${id})`, dipisahkan dengan tanda koma.

## 4. Keamanan & Sanitasi
- Proteksi SSRF terhadap IP privat dan loopback.
- Timeout request 12 detik.
- Kredensial diproses murni di memori server.

## 5. Integrasi & Contoh Penggunaan
```typescript
import { getTags } from "@/core/shared/tools/get-tags"

const result = await getTags({
  baseUrl: "https://myblog.com",
  username: "admin_user",
  applicationPassword: "xxxx xxxx xxxx xxxx",
})

if (result.ok) {
  console.log("Token-efficient tags:", result.tagsString)
  // Output: "tips (1), tutorial (5), wordpress (10)"
}
```

## 6. Riwayat Perubahan (Changelog)
- **v1.0.0 (2026-09-26)**: Rilis awal tool `get_tags` dengan output string hemat token.
