---
paths:
  - "src/core/writer/**"
  - "src/core/queue/**"
  - "src/core/shared/tools/**"
  - "src/core/shared/formatters/**"
  - "src/core/shared/media/**"
  - "src/core/shared/settings.json"
  - "src/app/api/posts/**"
  - "src/app/api/queue/**"
  - "src/app/api/lab/**"
  - "src/app/api/agents/**"
---

# Standar System Writer (Agent Profile Runtime)

Rujukan arsitektur lengkap: `docs/system-writer-architecture.md` dan `ARCHITECTURE.md`.

## 1. Agent Profile Runtime
- Profil bawaan dipusatkan di `src/core/writer/profiles/builtin.ts`; tipe & batas di `src/core/writer/types/profile.ts`; profil kustom pengguna disimpan di database.
- Dua mode: `standard` (LangChain `createAgent`) dan `deep` (Deep Agent yang dapat membaca modul `SKILL.md` dari `agent_skills`, lihat `runtime/resolve-skills.ts`).
- Batas eksekusi (model calls, tool calls, timeout, word count, per-tool quota) bersumber dari `src/core/shared/settings.json` dan selalu dilewatkan `clampLimits()`. Jangan hardcode angka batas di tempat lain.
- Terminologi wajib **Agent Profile**. Jangan memperkenalkan istilah/interface "engine" baru. `presets/registry.ts` hanya shim kompatibilitas.

## 2. Pre-Flight Taxonomy & Author Resolver
- Kategori, tag, dan persona author dikunci oleh `runtime/pre-resolve.ts` **sebelum** agen menulis (LLM dengan prompt `system-resolve-taxonomy-author.md`, fallback heuristik).
- **Dilarang** menambahkan tool administratif WordPress (`list_wp_categories`, `list_wp_tags`, `list_wp_authors`, dsb.) ke toolset agen.
- Akun admin teknis (`admin`, `administrator`, `*_admin`) tidak boleh dipilih sebagai author selama ada persona manusia (filter `isTechnicalAdminUser`, ADR-060).
- Data author hanya referensi persona; byline "Penulis: …" dilarang dan disanitasi `markdown-cleaner.ts`.

## 3. Enam Universal Tools (riset & visual saja)
`keyword_suggestions`, `web_search`, `web_reader`, `image_search`, `set_featured_image`, `upload_media`
— definisi di `src/core/writer/tools/definitions/`, implementasi di `src/core/shared/tools/`, registrasi di `tools/registry.ts`. Tool baru harus murni riset/visual dan wajib lewat diskusi dengan pengguna.

## 4. Markdown-First → Gutenberg
- LLM menulis **Markdown murni**. Pembersihan (`formatters/markdown-cleaner.ts`) dan konversi deterministik ke Native Gutenberg Blocks (`<!-- wp:... -->`, `formatters/gutenberg.ts`) dilakukan di `runtime/postprocess.ts` sebelum dikirim ke WP REST API.
- Jangan meminta LLM menghasilkan HTML/Gutenberg langsung.

## 5. Anti-Infinite Loop Guards (wajib dipertahankan)
Diimplementasikan di `runtime/loop-guard.ts` dan `runtime/guards.ts`:
- deduplikasi panggilan tool identik berturut-turut;
- circuit breaker: tool dinonaktifkan setelah 2× gagal berturut-turut;
- kuota global & per-tool (hard limits);
- tepat 1× emergency finalize call (`runtime/finalize.ts`, prompt `system-finalize.md`) saat batas tercapai.
Perubahan pada guard wajib menjaga keempat jaminan ini.

## 6. Queue & Idempotensi (lihat juga CLAUDE.md §Prinsip Inti)
- Job tidak pernah dijalankan di dalam request HTTP: route hanya mencatat/menjadwalkan ulang item lalu `nudge` runner (`src/server/queue/`).
- Klaim hanya lewat RPC `claim_post_items` (lease `locked_by`/`locked_until`, batas per situs, `FOR UPDATE SKIP LOCKED`); `locked_by` adalah token unik per klaim dan setiap penulisan state worker + heartbeat di-*fence* dengan token itu + state persis yang diharapkan (jangan memakai `retry_count` sebagai pagar).
- Request pembuatan post ke WordPress hanya dikirim setelah `context.beginWordPressRequest()` bernilai `true`; item `syncing_to_wp` yang `wp_post_id`-nya tercatat dituntaskan sebagai sukses, bukan `failed_*`.
- Retry otomatis & dead-letter hanya lewat `src/core/queue/retry-policy.ts`; kegagalan sinkronisasi yang mungkin sudah membuat post (timeout/5xx) tidak boleh dikirim ulang otomatis.
- "Kirim ulang" memindahkan `failed_sync` → `ready_to_sync` dan runner mengirim naskah tersimpan; **jangan** memicu generasi AI ulang.
- Selalu cek `wp_post_id` sebelum membuat post baru agar retry tidak menggandakan posting.
- Uji ke WordPress nyata default `status: "draft"` kecuali pengguna meminta `publish`.
