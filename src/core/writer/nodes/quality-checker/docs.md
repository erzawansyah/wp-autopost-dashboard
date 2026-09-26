---
id: "quality-checker"
name: "Quality Checker Node (LLM Gatekeeper)"
type: "node"
version: "1.0.0"
status: "stable"
description: "Node pengambil keputusan berbasis LLM yang mengevaluasi apakah draf naskah layak terbit atau merupakan penolakan chatbot percakapan sebelum lanjut ke WordPress."
author: "Antigravity Engineering"
tags: ["evaluator", "gatekeeper", "llm", "quality", "decision"]

side_effects:
  modifies_database: false
  calls_paid_api: true
  calls_wordpress: false

inputs:
  - name: "state.rawTitle"
    type: "string"
    required: true
    description: "Judul artikel hasil drafter."
  - name: "state.rawMarkdown"
    type: "string"
    required: true
    description: "Isi naskah Markdown hasil drafter."
  - name: "state.context.llmService"
    type: "OpenRouterLlmService"
    required: true
    description: "Instance LLM untuk menjalankan inferensi evaluasi."

outputs:
  - name: "error"
    type: "WriterError | undefined"
    description: "Jika ditolak (isAcceptable = false), field error akan terisi sehingga memicu LangGraph untuk STOP."
  - name: "nodesExecuted"
    type: "string[]"
    description: "Catatan penambahan node 'quality_checker'."

dependencies:
  - "zod"
  - "src/core/writer/types/engine"
---

# Quality Checker Node (LLM Gatekeeper)

## 1. Ikhtisar & Tujuan
Node ini berfungsi sebagai **penjaga gerbang (gatekeeper)** mutlak sebelum naskah masuk ke tahap formatting dan pengiriman WordPress. Alih-alih menggunakan skrip regex atau daftar kata kunci penolakan yang rapuh, node ini memanfaatkan inferensi cerdas LLM dengan suhu rendah (`0.1`) untuk memutuskan secara tegas apakah naskah layak tayang atau harus dihentikan (*stop*).

## 2. Cara Kerja & Alur Logika (Workflow)
1. Menerima sampel teks naskah dari `state.rawMarkdown`.
2. Mengirimkan prompt evaluasi ke LLM dengan skema Zod `QualityCheckSchema` (`{ isAcceptable: boolean, reason: string }`).
3. **Keputusan Percabangan (Branching)**:
   - Jika `isAcceptable === false`: Mengisi `state.error` dengan kode `CHATBOT_REFUSAL_DETECTED`. LangGraph akan mengarahkan alur langsung ke `END` dan menghentikan pengiriman ke WordPress.
   - Jika `isAcceptable === true`: Alur dilanjutkan ke node pemformatan (`gutenberg_formatter`).

## 3. Spesifikasi Parameter (Inputs & Options)
Mengakses `state.context.request`, `state.rawTitle`, dan `state.rawMarkdown`.

## 4. Spesifikasi Keluaran (Outputs)
Mengembalikan pembaruan parsial terhadap `WriterState` (`error`, `warnings`, `nodesExecuted`).

## 5. Penanganan Error & Kasus Khusus (Edge Cases)
- **Teks Kosong**: Otomatis ditolak dengan error `EMPTY_CONTENT`.
- **Gangguan Jaringan Evaluator**: Jika panggilan evaluasi gagal teknis (misal timeout), sistem meloloskan dengan catatan peringatan (*warning*) agar tidak menghambat penerbitan artikel valid.

## 6. Contoh Pemanggilan (Code Example)
```typescript
import { qualityCheckerNode } from "@/core/writer/nodes/quality-checker"
import { StateGraph, END } from "@langchain/langgraph"

const workflow = new StateGraph(WriterStateAnnotation)
  .addNode("quality_checker", qualityCheckerNode)
  .addConditionalEdges("quality_checker", (state) => {
    return state.error ? END : "gutenberg_formatter"
  })
```
