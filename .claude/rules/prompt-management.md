---
paths:
  - "src/core/**"
  - "src/lib/ai/**"
  - "src/app/api/**"
---

# Manajemen Prompt LLM (3 Pilar)

## 1. Larangan Hardcode
- **Dilarang** menulis teks prompt (system, user template, finalize, prompt WP Tools, dll.) di dalam `.ts`/`.tsx`.
- Fallback `loadPrompt(file, fallback)` hanya boleh berupa satu kalimat keselamatan, bukan salinan prompt multiline.
- Muat prompt lewat `src/core/shared/prompts/loader.ts`: `loadPrompt`, `loadSectionedPrompt`, `loadParsedPrompt`, lalu interpolasi `renderPrompt` (`{{variabel}}`).

## 2. Lokasi & Penamaan
Semua prompt berupa berkas `.md` di `src/core/shared/prompts/` dengan salah satu prefix:
1. `wp-tools-*` — taksonomi, author persona, link building (mis. `wp-tools-categories-suggest.md`).
2. `system-*` — fondasi runtime: guardrail, finalize, pre-resolve (mis. `system-guardrail.md`).
3. `agent-*` — profil agen & template pesan pengguna (mis. `agent-quick-writer.md`, `agent-user-prompt.md`).

## 3. Format Berkas
```markdown
---
description: Satu kalimat fungsi prompt
used_by:
  - src/path/ke/pemakai.ts
variables:
  - key: keyword
    desc: Topik atau kata kunci artikel
---

[SYSTEM_PROMPT]
...
[/SYSTEM_PROMPT]

[USER_PROMPT]
... {{keyword}} ...
[/USER_PROMPT]

[OUTPUT_FORMAT]
{ "title": "string", "excerpt?": "string" }
[/OUTPUT_FORMAT]
```
- Frontmatter `description`, `used_by`, `variables` wajib dan harus sinkron dengan pemakai serta variabel yang benar-benar diinterpolasi.
- Key berakhiran `?` di `[OUTPUT_FORMAT]` = opsional/nullable; loader menginfer JSON Schema strict otomatis. `[OUTPUT_SCHEMA]` opsional untuk schema eksplisit.
- Saat menambah/mengganti nama prompt, perbarui `used_by` dan semua pemanggil; jangan meninggalkan berkas yatim.
