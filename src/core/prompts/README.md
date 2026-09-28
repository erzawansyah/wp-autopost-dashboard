# Arsitektur Prompt Skala Engine (Engine-Centric Prompts)

Repositori ini menerapkan arsitektur **Engine-Centric Prompts**, di mana konfigurasi dan persona prompt dikelompokkan berdasarkan **Writing Engine** (`quick`, `standard`, dst.), bukan terisolasi kaku di tingkat node.

---

## 1. Motivasi & Latar Belakang

Setiap Writing Engine memiliki karakteristik, tujuan, dan rantai node yang berbeda:
- **Quick Engine**: Bertujuan untuk kecepatan dan efisiensi token (1-shot generation). Node `article_drafter` di Quick Engine harus menulis mandiri tanpa menunggu data riset dan tanpa menyematkan gambar.
- **Standard Engine**: Bertujuan untuk kedalaman editorial. Node `article_drafter` di Standard Engine **wajib mengacu pada cetak biru riset web** dan **wajib menyematkan aset gambar terkurasi**.

Dengan menyatukan prompt per engine:
1. Satu file markdown merepresentasikan seluruh "jiwa" dan kepribadian penulisan sebuah engine dari awal hingga akhir.
2. Memudahkan fitur **User Prompt Override / Modification** di tingkat dashboard SaaS tanpa membongkar kode TypeScript.
3. Node tetap modular dan agnostic, menerima instruksi yang disuntikkan oleh engine yang sedang berjalan.

---

## 2. Struktur Berkas

```
src/core/prompts/
├── README.md                     # Dokumentasi arsitektur
├── quick-engine-prompts.md       # Seluruh prompt default untuk Quick Engine
└── standard-engine-prompts.md    # Seluruh prompt default untuk Standard Engine
```

---

## 3. Format Penulisan Berkas Markdown

Setiap berkas prompt engine menggunakan format Markdown terstruktur dengan pembagian blok node:

```markdown
---
engine: "quick"
version: "1.0.0"
description: "Kumpulan prompt default untuk Quick Engine"
---

# Quick Engine Prompts

## [NODE: taxonomy_resolver]
### [SYSTEM_PROMPT]
Instruksi sistem untuk taxonomy resolver...
### [USER_PROMPT]
Instruksi pengguna dengan variabel {{keyword}}...

---

## [NODE: article_drafter]
### [SYSTEM_PROMPT]
Instruksi sistem anti-slop copywriter...
### [OUTPUT_FORMAT]
{ "title": "...", "excerpt": "...", "markdownContent": "..." }
### [USER_PROMPT]
Instruksi penulisan dengan variabel {{keyword}}, {{wordCountTarget}}, dll...

---

## [NODE: quality_checker]
### [SYSTEM_PROMPT]
Instruksi evaluator mutu...
### [USER_PROMPT]
Evaluasi naskah {{rawMarkdown}}...
```

---

## 4. Mekanisme Loading & User Override

1. **Default Loader**: Engine memuat prompt dari berkas `src/core/prompts/{engineId}-engine-prompts.md` via `loadEnginePrompts(engineId)`.
2. **Context Injection**: Prompt yang dimuat disuntikkan ke `state.context.enginePrompts` oleh `defineEngine`.
3. **User / Database Override**: Jika pengguna menyesuaikan template prompt di pengaturan SaaS (tabel `prompt_templates`), payload override langsung menggantikan node prompt terkait pada saat runtime.
4. **Node Execution**: Masing-masing node membaca prompt dari `state.context.enginePrompts[nodeId]`, lalu merender variabel dinamis sebelum memanggil LLM.
