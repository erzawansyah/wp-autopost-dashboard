---
id: "taxonomy-resolver"
name: "Taxonomy & Metadata Resolver Node"
type: "node"
version: "1.0.0"
status: "stable"
description: "Melengkapi kategori, tag, dan author WordPress secara otonom saat pengguna tidak memasukkannya secara manual."
author: "Antigravity Engineering"
tags: ["taxonomy", "categories", "tags", "metadata"]

side_effects:
  modifies_database: false
  calls_paid_api: false
  calls_wordpress: false

inputs:
  - name: "keyword"
    type: "string"
    required: true
    description: "Kata kunci topik utama artikel."
  - name: "categoryIds"
    type: "number[]"
    required: false
    description: "ID kategori WordPress yang diinput pengguna."
  - name: "tagNames"
    type: "string[]"
    required: false
    description: "Daftar tag yang diinput pengguna."
  - name: "authorId"
    type: "number"
    required: false
    description: "ID author target di WordPress."
  - name: "availableCategories"
    type: "Array<{ id: number; name: string }>"
    required: false
    description: "Daftar kategori situs yang tersedia dari cache lokal."

outputs:
  - name: "categoryIds"
    type: "number[]"
    description: "Daftar ID kategori terisi (bisa dari input pengguna atau hasil resolusi otomatis)."
  - name: "tagNames"
    type: "string[]"
    description: "Daftar tag terisi."
  - name: "authorId"
    type: "number"
    description: "ID author terverifikasi."
  - name: "isAutoResolved"
    type: "boolean"
    description: "Menandai apakah ada metadata yang diisi secara otomatis."

dependencies: []
---

# Taxonomy & Metadata Resolver Node

## 1. Ikhtisar & Tujuan
Node ini memastikan bahwa setiap naskah yang siap diterbitkan memiliki taksonomi WordPress yang lengkap (kategori, tag, dan author), sehingga artikel tidak terlantar tanpa metadata meskipun pengguna hanya menginput kata kunci polos.

## 2. Cara Kerja & Alur Logika (Workflow)
1. Memeriksa array `categoryIds`. Jika kosong:
   - Mencari kecocokan semantik dari `availableCategories` dengan `keyword`.
   - Jika tidak ada daftar kategori, menetapkan fallback ke ID `1` (*Uncategorized*).
2. Memeriksa array `tagNames`. Jika kosong:
   - Mengambil `keyword` sebagai tag utama.
   - Mengekstrak 1-2 frasa turunan dari kata kunci tanpa kata hubung (*stop words*).
3. Memeriksa `authorId`. Jika kosong, menetapkan default ke ID `1`.

## 3. Spesifikasi Parameter (Inputs & Options)
- `keyword` (string, wajib)
- `categoryIds` (array angka, opsional)
- `tagNames` (array string, opsional)
- `authorId` (angka, opsional)
- `availableCategories` (daftar objek id & nama kategori, opsional)

## 4. Spesifikasi Keluaran (Outputs)
Objek `TaxonomyResolverResult` dengan field `categoryIds`, `tagNames`, `authorId`, dan status resolusi.

## 5. Penanganan Error & Kasus Khusus (Edge Cases)
- Jika tidak ada kategori yang cocok sama sekali, selalu mengembalikan fallback ID 1 sehingga tidak menimbulkan error HTTP 400 saat diposting ke WordPress.

## 6. Contoh Pemanggilan (Code Example)
```typescript
import { executeTaxonomyResolver } from "@/core/writer/nodes/taxonomy-resolver"

const resolved = executeTaxonomyResolver({
  keyword: "cara merawat aglaonema",
  categoryIds: [],
  tagNames: [],
})

console.log(resolved.categoryIds) // [1]
console.log(resolved.tagNames) // ["cara merawat aglaonema", "merawat aglaonema"]
```
