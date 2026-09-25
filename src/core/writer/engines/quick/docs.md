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
  - name: "request.content.style"
    type: "string"
    required: false
    default: "default"
    description: "Nama berkas aturan gaya bahasa di src/core/writer/styles/ (e.g. 'listicle', 'essay', 'how-to-tutorial', 'in-depth-review')."
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
  - "@langchain/openrouter"
  - "zod"
  - "src/core/shared/formatters/gutenberg"
  - "src/core/shared/formatters/markdown-cleaner"
  - "src/core/writer/services/style-resolver"
---

# Tulis Cepat (Quick Engine)

## 1. Ikhtisar & Tujuan

`QuickEngine` adalah mesin generasi artikel instan yang dirancang untuk kecepatan tinggi dan efisiensi biaya. Engine ini menggunakan strategi **1-shot generation** yang dipadukan dengan pendekatan **Markdown-First** dan **Native Gutenberg Block Serialization**.

Engine ini sangat cocok untuk:
- Modul "Tulis Cepat" di mana pengguna menginginkan draf siap tayang dalam waktu kurang dari 20 detik.
- Eksekusi batch masal ratusan artikel yang memprioritaskan konsumsi token rendah dan stabilitas tinggi.

## 2. Cara Kerja & Alur Logika (Workflow)

```mermaid
sequenceDiagram
    participant Facade as Writer Facade
    participant Engine as QuickEngine
    participant Style as StyleRuleResolver
    participant LLM as OpenRouter LLM
    participant Cleaner as Markdown Cleaner
    participant G as Gutenberg Serializer

    Facade->>Engine: execute(context)
    Engine->>Style: getStyleInstruction(styleName)
    Style-->>Engine: Konten style rule (misal listicle.md)
    Engine->>Engine: Rakit System Prompt (Anti-Slop v3.0 + Style Rule)
    Engine->>LLM: generate({ systemPrompt, userPrompt, schema: QuickOutputSchema })
    LLM-->>Engine: Respon JSON { title, excerpt, markdownContent }
    
    alt Terdeteksi Penolakan Chatbot atau Konten < 350 Karakter
        Engine->>LLM: Eksekusi Recovery Generator ("Sebagai publisher otonom...")
        LLM-->>Engine: Respon Recovery Naskah Utuh
    end

    Engine->>Cleaner: cleanMarkdown() & sanitizeDashes()
    Cleaner-->>Engine: Markdown bersih, nol-dash
    Engine->>G: markdownToGutenberg(cleanedMarkdown)
    G-->>Engine: HTML dengan blok resmi <!-- wp:... -->
    Engine-->>Facade: EngineResult { success: true, article, ... }
```

## 3. Spesifikasi Parameter (Inputs & Options)

| Parameter | Tipe | Wajib | Default | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| `keyword` | `string` | **Ya** | - | Topik atau kata kunci utama artikel. |
| `style` | `string` | Tidak | `"default"` | Pilihan style dari direktori `styles/` (`listicle`, `essay`, `how-to-tutorial`, dll.). |
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
