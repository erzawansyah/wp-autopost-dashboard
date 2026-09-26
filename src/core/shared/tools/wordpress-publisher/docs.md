---
id: "wordpress-publisher"
name: "WordPress Publisher Tool"
type: "tool"
version: "1.0.0"
status: "stable"
description: "Tool universal untuk menerbitkan artikel berbasis blok Gutenberg ke WordPress REST API pengguna beserta resolusi pembuatan tag otomatis."
author: "Antigravity Engineering"
tags: ["wordpress", "publisher", "rest-api", "gutenberg", "tool"]

side_effects:
  modifies_database: false
  calls_paid_api: false
  calls_wordpress: true

inputs:
  - name: "baseUrl"
    type: "string"
    required: true
    description: "URL situs WordPress pengguna."
  - name: "username"
    type: "string"
    required: true
    description: "Username pengguna WordPress."
  - name: "applicationPassword"
    type: "string"
    required: true
    description: "Application Password WordPress."
  - name: "article"
    type: "object"
    required: true
    description: "Naskah artikel yang memuat title, contentHtml, excerpt, dan slug."
  - name: "metadata"
    type: "object"
    required: false
    description: "Metadata pendukung (status, categoryIds, tagNames, authorId)."

outputs:
  - name: "ok"
    type: "boolean"
    description: "Status keberhasilan pengiriman."
  - name: "wpPostId"
    type: "number"
    description: "ID artikel yang diterbitkan di WordPress."
  - name: "wpPostUrl"
    type: "string"
    description: "Tautan URL postingan WordPress."
  - name: "error"
    type: "string"
    description: "Pesan kesalahan jika pengiriman gagal."

dependencies:
  - "src/lib/wordpress/client"
---

# WordPress Publisher Tool

## 1. Ikhtisar & Tujuan
Tool ini bertindak sebagai adapter I/O teknis stateless antara aplikasi dashboard dan WordPress REST API. Menerima naskah HTML Gutenberg dan metadata, menyelesaikan tag yang belum terdaftar, lalu mempostingnya ke endpoint WordPress pengguna.

## 2. Cara Kerja & Alur Logika (Workflow)
1. Jika terdapat nama tag (`tagNames`), memeriksa dan membuat tag baru melalui `resolveOrCreateWordPressTags()`.
2. Menyusun payload request WordPress (`WPCreatePostPayload`).
3. Mengirimkan HTTP POST ke `/wp-json/wp/v2/posts` via `createWordPressPost()`.
4. Mengembalikan respons status, ID postingan, dan permalink artikel WordPress.

## 3. Spesifikasi Parameter (Inputs & Options)
- `baseUrl`, `username`, `applicationPassword` (wajib)
- `article`: `{ title, contentHtml, excerpt?, slug? }` (wajib)
- `metadata`: `{ status?, categoryIds?, tagNames?, authorId? }` (opsional)

## 4. Spesifikasi Keluaran (Outputs)
Objek `WordPressPublishResult` (`{ ok, wpPostId?, wpPostUrl?, status?, error? }`).

## 5. Penanganan Error & Kasus Khusus (Edge Cases)
- **Tag gagal dibuat**: Proses penerbitan artikel tetap dilanjutkan tanpa tag tersebut agar tidak membatalkan artikel yang sudah selesai.
- **REST API Timeout**: Mengembalikan objek gagal dengan pesan error ramah pengguna untuk memicu *safe retry*.

## 6. Contoh Pemanggilan (Code Example)
```typescript
import { publishPostToWordPress } from "@/core/shared/tools/wordpress-publisher"

const result = await publishPostToWordPress({
  baseUrl: "https://myblog.com",
  username: "admin",
  applicationPassword: "xxxx xxxx xxxx",
  article: {
    title: "Artikel Pertama",
    contentHtml: "<!-- wp:paragraph --><p>Halo dunia!</p><!-- /wp:paragraph -->",
  },
  metadata: { status: "draft" },
})

if (result.ok) {
  console.log("Post ID:", result.wpPostId)
}
```
