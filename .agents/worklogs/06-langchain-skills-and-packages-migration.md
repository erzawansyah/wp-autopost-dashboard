# Worklog 06 — Migrasi Skills & Package Dependencies ke Ekosistem LangChain & LangGraph

## 1. Konteks & Permintaan Pengguna
1. Pengguna memutuskan untuk beralih dari skill spesifik OpenRouter ke ekosistem **LangChain** dan **LangGraph**.
2. Pengguna meminta eksekusi Langkah 1 sampai 3:
   - **Langkah 1**: Menghapus seluruh skill lama terkait OpenRouter dari direktori `.agents/skills/`.
   - **Langkah 2**: Memasang skill resmi dari repositori `langchain-ai/langchain-skills` serta memperbarui dokumen aturan arsitektur.
   - **Langkah 3**: Menginstal paket NPM LangChain resmi ke dalam `package.json`.
3. Langkah 4 (refactoring generator menjadi pipeline modular) ditangguhkan terlebih dahulu untuk sesi *brainstorming* arsitektur per-modul bersama pengguna.

## 2. Solusi & Perubahan Teknis
- **Pembersihan Skill OpenRouter (Langkah 1)**:
  - Menggunakan CLI `npx.cmd skills remove -y` untuk menghapus 18 skill OpenRouter dan harness pendukungnya (`openrouter-typescript-sdk`, `openrouter-models`, `openrouter-images`, `openrouter-generations`, `openrouter-analytics`, `create-agent-tui`, `install-ori-harness`, `spawn-ori-eval`, dll.).
- **Instalasi Skill LangChain & LangGraph (Langkah 2)**:
  - Menggunakan `npx.cmd skills add langchain-ai/langchain-skills --skill '*' --yes` untuk menginstal 22 skill standar agentic dari repositori resmi `langchain-ai/langchain-skills`.
  - Skill kunci terpasang meliputi: `langchain-fundamentals`, `langchain-dependencies`, `langchain-typescript-quickstart`, `langchain-middleware`, `langgraph-fundamentals`, `langgraph-persistence`, `langgraph-human-in-the-loop`, `langgraph-cli`, `deep-agents-core`, `deep-agents-memory`, `deep-agents-orchestration`, dan `swarm`.
  - Memperbarui [`.agents/rules/skills-routing-matrix.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/skills-routing-matrix.md) untuk memetakan tugas AI ke skill LangChain & LangGraph.
  - Memperbarui pedoman arsitektur di [`AGENTS.md`](file:///d:/Antigravity/wp-autopost-dashboard/AGENTS.md) dan mencatat **ADR-019** di [`MEMORY.md`](file:///d:/Antigravity/wp-autopost-dashboard/MEMORY.md).
- **Instalasi Package NPM LangChain (Langkah 3)**:
  - Menginstal dependensi resmi:
    - `@langchain/openrouter` (`^0.4.13`): Driver resmi dari LangChain khusus untuk OpenRouter dengan first-class support (fallback routing, provider preferences, dan native structured output).
    - `@langchain/core` (`^1.2.12`): Fondasi Runnables, Message types, Structured Output, dan BaseChatModel.
    - `@langchain/openai` (`^1.5.13`): Driver model alternatif/kompatibel OpenAI.
- **Migrasi Engine Tulis Cepat ke `@langchain/openrouter`**:
  - Mengubah [`src/lib/ai/generator.ts`](file:///d:/Antigravity/wp-autopost-dashboard/src/lib/ai/generator.ts) menggunakan `ChatOpenRouter` dari `@langchain/openrouter` dan pesan standar `@langchain/core/messages` (`SystemMessage`, `HumanMessage`).
  - Menerapkan Zod structured output (`ArticleOutputSchema`) dengan mekanisme *graceful fallback* ke standard JSON invoke jika model AI yang dipilih tidak mendukung function calling.
  - Mempertahankan penegakan ketat *Anti-Slop Writing v3.0* (bebas em-dash/en-dash, pembersihan frasa klise, variasi burstiness kalimat, dan estimasi waktu baca).
  - Menghapus dependensi lama `@openrouter/agent` dari `package.json`.

## 3. Status Verifikasi
- `npm.cmd skills list`: 22 skill LangChain & LangGraph terdaftar aktif di samping skill Supabase, Shadcn, Tailwind, dan WordPress.
- `package.json`: Terverifikasi penambahan `@langchain/openrouter`, `@langchain/core`, `@langchain/openai`, dan `@langchain/langgraph` serta penghapusan `@openrouter/agent`.
- `npm.cmd run build`: Sukses 100% pada semua 22 rute dan endpoint tanpa satupun error TypeScript maupun linting.
