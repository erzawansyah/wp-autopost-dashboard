---
id: "article-drafter"
name: "Article Drafter Node (Anti-Slop 1-Shot)"
type: "node"
version: "1.0.0"
status: "stable"
description: "Menghasilkan draf artikel lengkap dalam format Markdown murni melalui 1-shot LLM dengan panduan gaya Anti-Slop v3.0."
author: "Antigravity Engineering"
tags: ["ai", "openrouter", "markdown", "anti-slop", "drafter", "langgraph"]

side_effects:
  modifies_database: false
  calls_paid_api: true
  calls_wordpress: false

inputs:
  - name: "keyword"
    type: "string"
    required: true
    description: "Kata kunci fokus artikel."
  - name: "llmService"
    type: "OpenRouterLlmService"
    required: true
    description: "Layanan LLM instance untuk komunikasi API."
  - name: "language"
    type: "'id' | 'en'"
    required: false
    default: "id"
    description: "Bahasa naskah."
  - name: "wordCountTarget"
    type: "number"
    required: false
    default: 800
    description: "Target perkiraan jumlah kata naskah."

outputs:
  - name: "rawTitle"
    type: "string"
    description: "Judul artikel yang dihasilkan."
  - name: "rawExcerpt"
    type: "string"
    description: "Ringkasan padat meta deskripsi."
  - name: "rawMarkdown"
    type: "string"
    description: "Isi naskah lengkap dalam format Markdown murni."
  - name: "tokenUsage"
    type: "object"
    description: "Metrik token masukan dan luaran AI."

dependencies:
  - "zod"
  - "src/lib/ai/openrouter"
---

# Article Drafter Node (Anti-Slop 1-Shot)

## 1. Ikhtisar & Tujuan
Node ini mengeksekusi pembuatan konten inti naskah artikel menggunakan LLM. Naskah dihasilkan dalam format Markdown murni yang mematuhi aturan penulisan manusiawi (Anti-Slop v3.0), seperti larangan em-dash, pelarangan kata klise robot, dan persona publisher otonom.

Node ini dapat dipanggil langsung sebagai fungsi utilitas (`executeArticleDrafter`) ataupun dirangkai langsung sebagai Node LangGraph (`articleDrafterNode`).

## 2. Cara Kerja & Alur Logika (Workflow)
1. Merangkai system prompt anti-slop dengan aturan tipografi (nol em-dash) dan banlist kata klise.
2. Memanggil `llmService.generate()` dengan output schema JSON terstruktur (`DrafterOutputSchema`).
3. Mem-parse respon JSON untuk mengambil judul, kutipan meta, dan isi Markdown.
4. Mengembalikan naskah Markdown mentah beserta judul, kutipan, dan metrik penggunaan token.

## 3. Spesifikasi Parameter (Inputs & Options)
- `keyword` (string, wajib)
- `llmService` (instance OpenRouterLlmService, wajib)
- `language` ("id" | "en", default: "id")
- `wordCountTarget` (number, default: 800)
- `customInstructions` (string, opsional)

## 4. Spesifikasi Keluaran (Outputs)
Objek hasil dengan field `rawTitle`, `rawExcerpt`, `rawMarkdown`, dan `tokenUsage`.

## 5. Penanganan Error & Kasus Khusus (Edge Cases)
- **JSON Output Rusak**: Regex fallback mengekstrak teks Markdown langsung dari respon mentah.
- **API LLM Error**: Melemparkan atau mengembalikan error terstruktur dengan kode `GENERATION_ERROR` bertanda `retryable: true`.

## 6. Contoh Pemanggilan (Code Example)
```typescript
import { articleDrafterNode } from "@/core/writer/nodes/article-drafter"
import { StateGraph } from "@langchain/langgraph"

// Digunakan langsung di StateGraph LangGraph:
const workflow = new StateGraph(WriterStateAnnotation)
  .addNode("article_drafter", articleDrafterNode)
```
