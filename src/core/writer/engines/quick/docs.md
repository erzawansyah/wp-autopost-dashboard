---
id: "quick"
name: "Tulis Cepat (1-Shot Markdown to Gutenberg)"
type: "engine"
version: "1.0.0"
status: "stable"
description: "Menghasilkan artikel utuh secara cepat dalam satu putaran generasi LLM dengan format Markdown murni yang dikonversi secara deterministik menjadi blok komentar Gutenberg resmi WordPress."
author: "Antigravity Engineering"
tags: ["fast", "1-shot", "markdown-first", "gutenberg", "anti-slop"]

capabilities:
  supportsResearch: false
  supportsInContentImages: false
  supportsAudit: false
  estimatedDurationSeconds: 15
  recommendedModelTier: "fast"

side_effects:
  modifies_database: false
  calls_paid_api: true
  calls_wordpress: false

inputs:
  - name: "request.content.keyword"
    type: "string"
    required: true
    description: "Kata kunci atau topik artikel yang akan ditulis."
  - name: "request.content.brief"
    type: "string"
    required: false
    description: "Catatan khusus atau panduan sudut pandang tambahan dari pengguna."
  - name: "request.content.wordCountTarget"
    type: "number"
    required: false
    default: 800
    description: "Target perkiraan jumlah kata (minimal 300, maksimal 5000)."
  - name: "request.content.language"
    type: "string"
    required: false
    default: "id"
    description: "Kode bahasa artikel ('id' untuk Indonesia, 'en' untuk Inggris)."

outputs:
  - name: "article.title"
    type: "string"
    description: "Judul artikel yang lugas, bersih dari tanda kutip atau karakter em-dash/en-dash."
  - name: "article.slug"
    type: "string"
    description: "Slug URL yang dinormalisasi untuk WordPress permalink."
  - name: "article.markdownContent"
    type: "string"
    description: "Naskah artikel lengkap dalam format Markdown murni."
  - name: "article.contentHtml"
    type: "string"
    description: "Naskah artikel lengkap dalam format HTML WordPress Gutenberg Blocks resmi (<!-- wp:heading -->, <!-- wp:paragraph -->, dll.)."
  - name: "article.excerpt"
    type: "string"
    description: "Ringkasan padat meta deskripsi 1-2 kalimat (maksimal 160 karakter)."
  - name: "article.wordCount"
    type: "number"
    description: "Jumlah kata aktual artikel."
  - name: "article.readingTimeMinutes"
    type: "number"
    description: "Estimasi waktu membaca dalam menit (berdasarkan rasio 200 kata/menit)."
  - name: "article.subheadings"
    type: "string[]"
    description: "Daftar teks seluruh heading H2 dan H3 yang ada di dalam naskah."

dependencies:
  - "@langchain/langgraph"
  - "@langchain/openrouter"
  - "zod"
  - "src/core/writer/nodes/taxonomy-resolver"
  - "src/core/writer/nodes/article-drafter"
  - "src/core/writer/nodes/quality-checker"
  - "src/core/writer/nodes/gutenberg-formatter"
---

# Tulis Cepat (Quick Engine)

## 1. Ikhtisar & Tujuan

`QuickEngine` adalah mesin generasi artikel instan yang dirancang untuk kecepatan tinggi dan efisiensi biaya. Engine ini mengorkestrasi node-node modular independen menggunakan **LangGraph StateGraph** dengan gerbang keputusan mutu (*quality gatekeeper*) sebelum diunggah ke WordPress.

Engine ini sangat cocok untuk:
- Modul "Tulis Cepat" di mana pengguna menginginkan draf siap tayang dalam waktu kurang dari 20 detik.
- Eksekusi batch masal ratusan artikel yang memprioritaskan konsumsi token rendah dan stabilitas tinggi.

### Node yang Digunakan (Node Composition)

Karena setiap Node di `src/core/writer/nodes/` bersifat modular dan *engine-agnostic* (dapat dipakai ulang lintas engine), `QuickEngine` mengombinasikan node-node berikut:

| Urutan | Node yang Dipakai | Lokasi | Peran dalam QuickEngine |
| :---: | :--- | :--- | :--- |
| **Tahap 1** | `taxonomy-resolver` | `src/core/writer/nodes/taxonomy-resolver` | Mengisi kategori, tag, dan author default jika tidak diisi pengguna. |
| **Tahap 2** | `article-drafter` | `src/core/writer/nodes/article-drafter` | Menulis naskah utuh 1-shot format Markdown murni (Anti-Slop v3.0). |
| **Tahap 3** | `quality-checker` | `src/core/writer/nodes/quality-checker` | **Pengambil Keputusan (LLM Gatekeeper)**: Memeriksa kelayakan naskah; jika penolakan AI, hentikan alur (*stop*). |
| **Tahap 4** | `gutenberg-formatter` | `src/core/writer/nodes/gutenberg-formatter` | Sanitasi dash, ekstraksi metrik, dan serialisasi deterministik ke blok Gutenberg resmi. |

*(Catatan: `input-validator` dijalankan di pintu gerbang Facade Orchestrator `writer.run()` sebelum masuk ke engine).*

## 2. Cara Kerja & Alur Logika (Workflow)

```mermaid
flowchart LR
    START([START]) --> N_Tax["taxonomy_resolver"]
    N_Tax --> N_Draft["article_drafter"]
    N_Draft --> N_QC{"quality_checker<br/>(LLM Decision)"}
    N_QC -- "Ditolak / Penolakan AI" --> END_STOP([STOP / END])
    N_QC -- "Layak Terbit" --> N_Fmt["gutenberg_formatter"]
    N_Fmt --> END_OK([END])
```

## 3. Spesifikasi Parameter (Inputs & Options)

| Parameter | Tipe | Wajib | Default | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| `keyword` | `string` | **Ya** | - | Topik atau kata kunci utama artikel. |
| `brief` | `string` | Tidak | `undefined` | Instruksi tambahan dari pengguna. |
| `wordCountTarget` | `number` | Tidak | `800` | Target jumlah kata minimal naskah. |
| `language` | `"id" \| "en"` | Tidak | `"id"` | Bahasa target penulisan. |

## 4. Spesifikasi Keluaran (Outputs)

Engine mengembalikan objek `EngineResult` yang membungkus `GeneratedArticle`:
- `markdownContent`: Digunakan untuk preview editor teks, audit, atau ekspor markdown.
- `contentHtml`: Digunakan saat dikirim ke WordPress REST API (`POST /wp-json/wp/v2/posts`) sehingga otomatis dirender sebagai blok Gutenberg asli di WP Admin.

## 5. Penanganan Error & Kasus Khusus (Edge Cases)

1. **Jebakan Persona Chatbot**:
   Jika model AI mengembalikan frasa penolakan (seperti *"Mohon maaf, saya tidak dapat menemukan informasi..."*), fungsi `isChatbotRefusal()` akan mendeteksinya secara otomatis dan langsung memicu **Recovery Generator** otonom tanpa membatalkan proses.
2. **Pelanggaran Tanda Baca Dash**:
   Karakter em-dash (`—`) atau en-dash (`–`) yang lolos dari filter LLM akan disanitasi secara deterministik menjadi tanda koma atau tanda kurung oleh `sanitizeDashes()`.
3. **Format JSON Rusak**:
   Jika LLM mengembalikan teks mentah alih-alih JSON valid, engine memiliki parser regex fallback untuk mengekstrak naskah Markdown dan judul secara otomatis.

## 6. Contoh Pemanggilan (Code Example)

```typescript
import { run } from "@/core/writer"

const result = await run({
  engine: "quick",
  content: {
    keyword: "Tips merawat aglaonema agar daun mengilap",
    style: "how-to-tutorial",
    language: "id",
    wordCountTarget: 800,
  },
  site: {
    siteId: "site-uuid-001",
    wpSiteId: "site-uuid-001",
  },
  publishing: {
    mode: "draft",
    categoryIds: [12],
    tagNames: ["aglaonema", "tanaman hias"],
  },
})

if (result.success && result.article) {
  console.log("Judul:", result.article.title)
  console.log("Gutenberg HTML:\n", result.article.contentHtml)
}
```
