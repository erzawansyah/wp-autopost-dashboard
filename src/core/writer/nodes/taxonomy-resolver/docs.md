---
id: "taxonomy-resolver"
name: "Taxonomy & Metadata Resolver Node"
type: "node"
version: "1.1.0"
status: "stable"
description: "Melengkapi kategori, tag, dan author WordPress secara cerdas menggunakan tools live WordPress (get_categories, get_tags, get_author, create_tags) dan evaluasi LLM."
author: "Antigravity Engineering"
tags: ["taxonomy", "categories", "tags", "author", "metadata", "llm-resolver"]

side_effects:
  modifies_database: false
  calls_paid_api: true
  calls_wordpress: true

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
  - name: "site"
    type: "object"
    required: false
    description: "Kredensial website WordPress untuk mengakses tools."

outputs:
  - name: "categoryIds"
    type: "number[]"
    description: "Daftar ID kategori terisi (kategori wajib terisi)."
  - name: "tagIds"
    type: "number[]"
    description: "Daftar ID tag yang sudah ada atau baru dibuat."
  - name: "tagNames"
    type: "string[]"
    description: "Daftar nama tag terisi."
  - name: "authorId"
    type: "number"
    description: "ID author terverifikasi (diutamakan non-admin)."
  - name: "authorDetail"
    type: "object"
    description: "Nama dan biografi author untuk panduan persona naskah."

dependencies:
  - "tools/get-categories"
  - "tools/get-tags"
  - "tools/get-author"
  - "tools/create-tags"
---

# Taxonomy & Metadata Resolver Node

## 1. Ikhtisar & Tujuan
Node ini memastikan bahwa setiap naskah yang siap diterbitkan memiliki taksonomi WordPress yang lengkap (kategori, tag, dan author). Jika input pengguna belum lengkap, node ini memanggil tools WordPress (`get_categories`, `get_tags`, `get_author`) dan menggunakan LLM untuk menentukan kategori yang wajib, tag yang cocok, serta author yang paling kompeten dengan menghindari akun admin. Jika tag belum ada yang cocok, node otomatis memanggil `create_tags`.

## 2. Cara Kerja & Alur Logika (Workflow)
1. **Pemeriksaan Input**: Memeriksa apakah `categoryIds` atau `authorId` belum diisi oleh pengguna.
2. **Pemanggilan Tools Live**:
   - `get_categories`: Mengambil seluruh kategori (name, slug, id, description).
   - `get_tags`: Mengambil string ringkas daftar tag yang sudah ada (`tag1 (id1), tag2 (id2)`).
   - `get_author`: Mengambil daftar seluruh penulis (`author_id`, `author_name`, `author_bio`).
3. **Seleksi Semantik via LLM**:
   - Meminta LLM menentukan kategori yang wajib cocok dengan topik.
   - Memilih tag yang sudah ada jika relevan (tags boleh kosong).
   - Mengusulkan tag baru jika diperlukan.
   - Memilih author yang paling sesuai dengan topik dan **menghindari akun admin**.
4. **Otomasi Pembuatan Tag**:
   - Jika LLM mengusulkan tag baru yang belum ada, node memanggil `create_tags` dan mengembalikan ID-nya.
5. **Penyelarasan State**:
   - Menyimpan `categoryIds`, `tagIds`, `authorId`, dan `authorDetail` ke dalam State.
   - Meneruskan profil author ke `promptConfig.variables` agar `article-drafter` dapat menulis sesuai persona penulis.
6. **Fallback Cerdas**:
   - Jika kredensial WordPress tidak tersedia (misal unit test lokal), node menggunakan fallback deterministik yang aman.

## 3. Spesifikasi Parameter (Inputs & Options)
- `keyword` (string, wajib)
- `categoryIds` (array angka, opsional)
- `tagNames` (array string, opsional)
- `authorId` (angka, opsional)

## 4. Spesifikasi Keluaran (Outputs)
- `categoryIds`: Array ID kategori.
- `tagIds`: Array ID tag (gabungan tag lama yang cocok dan tag baru).
- `tagNames`: Array nama tag.
- `authorId`: ID author terpilih.
- `authorDetail`: Objek `{ id, name, bio }`.

## 5. Penanganan Error & Kasus Khusus (Edge Cases)
- Jika website belum memiliki tag, node tetap berjalan lancar dan membuat tag baru sesuai topik.
- Jika semua user ber-username 'admin', node tetap memilih user tersebut dengan fallback aman tanpa error.
- Jika koneksi WordPress timeout/gagal, node otomatis beralih ke fallback deterministik tanpa membatalkan proses penulisan.

## 6. Riwayat Perubahan (Changelog)
- **v1.1.0 (2026-09-26)**: Integrasi penuh dengan tools `get_categories`, `get_tags`, `get_author`, `create_tags`, dan seleksi LLM Structured Output.
- **v1.0.0 (2026-09-26)**: Rilis awal mode deterministik.
