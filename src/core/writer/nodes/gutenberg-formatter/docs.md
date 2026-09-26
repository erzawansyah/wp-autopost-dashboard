---
id: "gutenberg-formatter"
name: "Gutenberg Formatter & Serializer Node"
type: "node"
version: "1.0.0"
status: "stable"
description: "Membersihkan tanda baca naskah (nol dash) dan mengonversi format Markdown murni ke blok Gutenberg WordPress resmi secara deterministik (0 ms, 0 token cost)."
author: "Antigravity Engineering"
tags: ["gutenberg", "formatter", "markdown", "serializer", "wordpress"]

side_effects:
  modifies_database: false
  calls_paid_api: false
  calls_wordpress: false

inputs:
  - name: "rawTitle"
    type: "string"
    required: true
    description: "Judul mentah artikel."
  - name: "rawExcerpt"
    type: "string"
    required: true
    description: "Kutipan atau ringkasan meta deskripsi."
  - name: "rawMarkdown"
    type: "string"
    required: true
    description: "Naskah artikel lengkap format Markdown."

outputs:
  - name: "article"
    type: "GeneratedArticle"
    description: "Objek artikel final siap tayang dengan markdownContent dan contentHtml blok Gutenberg."

dependencies:
  - "src/core/shared/formatters/gutenberg"
  - "src/core/shared/formatters/markdown-cleaner"
---

# Gutenberg Formatter & Serializer Node

## 1. Ikhtisar & Tujuan
Node ini menjamin artikel yang diposting ke WordPress dapat diedit secara alami di WordPress Block Editor (Gutenberg) tanpa merusak struktur HTML. Menggunakan parser script deterministik sehingga bekerja instan tanpa membakar token LLM tambahan.

## 2. Cara Kerja & Alur Logika (Workflow)
1. Membersihkan tanda baca dash (`—`, `–`) pada judul, kutipan, dan naskah.
2. Mengekstrak metrik bacaan: jumlah kata (`calculateWordCount`), estimasi waktu baca (`readingTimeMinutes`), subheadings (`extractSubheadings`), dan URL permalink (`createSlug`).
3. Mengonversi teks Markdown ke blok HTML Gutenberg resmi (`<!-- wp:heading -->`, `<!-- wp:paragraph -->`, dll.).

## 3. Spesifikasi Parameter (Inputs & Options)
- `rawTitle` (string, wajib)
- `rawExcerpt` (string, wajib)
- `rawMarkdown` (string, wajib)

## 4. Spesifikasi Keluaran (Outputs)
Objek `GutenbergFormatterResult` yang membungkus `GeneratedArticle`.

## 5. Penanganan Error & Kasus Khusus (Edge Cases)
- Karakter dash yang lolos filter prompt LLM disanitasi secara deterministik menjadi tanda koma atau tanda kurung.

## 6. Contoh Pemanggilan (Code Example)
```typescript
import { executeGutenbergFormatter } from "@/core/writer/nodes/gutenberg-formatter"

const result = executeGutenbergFormatter({
  rawTitle: "Panduan Menanam Selada",
  rawExcerpt: "Cara praktis menanam selada hidroponik di rumah.",
  rawMarkdown: "## Persiapan\n\nSiapkan wadah dan nutrisi AB Mix...",
})

console.log(result.article.contentHtml) // <!-- wp:heading -->...
```
