# Standar Dokumentasi Komponen System Writer (DOCUMENTATION_STANDARD.md)

Dokumen ini adalah **pedoman resmi** untuk penyusunan berkas `docs.md` pada setiap unit **Engine**, **Node**, dan **Tool** di dalam `src/core/`.

---

## 1. Aturan Baku Penempatan Berkas

Setiap komponen yang berdiri sendiri **WAJIB** berada di dalam foldernya masing-masing dan menyertakan berkas `docs.md` tepat di samping kode sumbernya:

```text
src/core/
├── shared/
│   └── tools/<nama-tool>/
│       ├── index.ts
│       └── docs.md             <-- WAJIB ADA
├── writer/
│   ├── engines/<nama-engine>/
│   │   ├── index.ts
│   │   └── docs.md             <-- WAJIB ADA
│   └── nodes/<nama-node>/
│       ├── index.ts
│       └── docs.md             <-- WAJIB ADA
├── rewriter/
│   ├── engines/<nama-engine>/
│   │   └── docs.md
│   └── nodes/<nama-node>/
│       └── docs.md
└── link-auditor/
    └── engines/<nama-engine>/
        └── docs.md
```

---

## 2. Struktur Tetap Berkas `docs.md`

Setiap berkas `docs.md` **WAJIB** terdiri dari 2 bagian:
1. **YAML Frontmatter (Metadata Mesin & Registri)** di bagian paling atas.
2. **Konten Markdown Terstruktur (Panduan Pengembang & Pemeliharaan)** di bawahnya.

---

## 3. Skema Baku YAML Frontmatter

```yaml
---
id: "quick"                         # Identifier unik (kebab-case)
name: "Tulis Cepat (1-Shot)"        # Nama tampilan resmi
type: "engine"                      # Pilihan: 'engine' | 'node' | 'tool'
version: "1.0.0"                    # Semantic versioning
status: "stable"                    # Pilihan: 'stable' | 'experimental' | 'deprecated'
description: "Deskripsi singkat dan padat mengenai fungsi komponen ini."
author: "Antigravity Engineering"
tags: ["fast", "1-shot", "markdown", "gutenberg"]

# Deklarasi Kapabilitas (Khusus Engine)
capabilities:
  supportsResearch: false
  supportsInContentImages: false
  supportsAudit: false
  estimatedDurationSeconds: 15
  recommendedModelTier: "fast"

# Deklarasi Efek Samping (Khusus Node & Tool)
side_effects:
  modifies_database: false
  calls_paid_api: true
  calls_wordpress: false

# Kontrak Input
inputs:
  - name: "keyword"
    type: "string"
    required: true
    description: "Kata kunci atau topik utama artikel."
  - name: "style"
    type: "string"
    required: false
    default: "default"
    description: "Format aturan gaya naskah dari src/core/writer/styles/."

# Kontrak Output
outputs:
  - name: "article.markdownContent"
    type: "string"
    description: "Naskah artikel lengkap dalam format Markdown murni."
  - name: "article.contentHtml"
    type: "string"
    description: "Naskah artikel dalam format HTML WordPress Gutenberg Blocks."

# Ketergantungan Eksternal
dependencies:
  - "@langchain/openrouter"
  - "zod"
  - "src/core/shared/formatters/gutenberg"
  - "src/core/writer/services/style-resolver"
---
```

---

## 4. Bagian Konten Markdown yang Wajib Ada

Setelah blok YAML Frontmatter, berkas `docs.md` wajib memuat sub-bagian berikut secara berurutan:

```markdown
# [Nama Komponen]

## 1. Ikhtisar & Tujuan
Penjelasan mendalam mengapa komponen ini ada dan problem apa yang diselesaikannya.

## 2. Cara Kerja & Alur Logika (Workflow)
Uraian langkah demi langkah (bisa berupa poin-poin atau diagram Mermaid sederhana) bagaimana data diproses dari input hingga output.

## 3. Spesifikasi Parameter (Inputs & Options)
Tabel atau rincian parameter beserta tipe data, batasan (min/max), dan nilai default.

## 4. Spesifikasi Keluaran (Outputs)
Format objek data yang dikembalikan dan jaminan integritasnya.

## 5. Penanganan Error & Kasus Khusus (Edge Cases)
- Bagaimana komponen bereaksi jika jaringan timeout.
- Bagaimana komponen menangani penolakan atau format tidak valid.
- Apakah kegagalan bersifat *retryable* atau fatal.

## 6. Contoh Pemanggilan (Code Example)
Contoh kode TypeScript nyata bagaimana cara mengimpor dan memanggil komponen ini.
```
