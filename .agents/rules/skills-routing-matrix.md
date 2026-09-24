# Matriks Penggunaan Skill & Alur Kerja Agent (Skill Routing Rules)

Dokumen ini adalah **Panduan Alur Operasional Baku**. Setiap kali AI Agent hendak mengeksekusi suatu jenis pekerjaan, Agent **WAJIB** membaca dan mematuhi panduan dari *Skill* terkait sebelum menulis atau mengubah kode.

---

## 1. Standar AI Engine: OpenRouter SDK Resmi

Sistem `wp-autopost-dashboard` menggunakan paket resmi OpenRouter:
- **`@openrouter/agent`**: Untuk fitur agentic, pemanggilan `callModel`, tool calling, dan format converters.
- **`@openrouter/sdk`**: Untuk platform API, pendaftaran model, kuota/kredit, dan OAuth.
- Panduan implementasi wajib merujuk ke skill [`.agents/skills/openrouter-typescript-sdk`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/openrouter-typescript-sdk/SKILL.md).

---

## 2. Matriks Pemetaan Tugas ke Skill (Action-to-Skill Routing)

| Ketika Hendak Mengerjakan... | Kategori / Tugas Spesifik | Skill yang WAJIB Digunakan | Lokasi Instruksi Skill |
| :--- | :--- | :--- | :--- |
| **A. Desain & Komponen UI** | Membuat/mengubah Atom, Molecule, Organism, atau Layout | `shadcn` & `tailwind-design-system` | [shadcn/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/shadcn/SKILL.md) & [tailwind-design-system/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/tailwind-design-system/SKILL.md) |
| **B. Evaluasi UI/UX & Palet** | Menentukan warna, kontras WCAG AA, hierarki visual Trello-Fluent | `ui-ux-pro-max` | [ui-ux-pro-max/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/ui-ux-pro-max/SKILL.md) |
| **C. Arsitektur Komponen React** | Mencegah boolean prop explosion, compound components, React 19 pattern | `vercel-composition-patterns` | [vercel-composition-patterns/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/vercel-composition-patterns/SKILL.md) |
| **D. Database Supabase & SQL** | Membuat tabel baru, DDL migrasi, indexing antrean, RLS multi-tenant | `supabase-postgres-best-practices` | [supabase-postgres-best-practices/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/supabase-postgres-best-practices/SKILL.md) |
| **E. Auth & Supabase Client** | Menyiapkan `@supabase/ssr` cookies, Server Actions, Realtime channel | `supabase` | [supabase/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/supabase/SKILL.md) |
| **F. Integrasi WordPress REST API** | Endpoint `/wp/v2/posts`, taksonomi kategori/tag, Application Passwords | `wp-rest-api` | [wp-rest-api/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/wp-rest-api/SKILL.md) |
| **G. Sandbox Uji Coba WP** | Menguji pipeline publishing tanpa server live atau WP Playground lokal | `wp-playground` & `blueprint` | [wp-playground/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/wp-playground/SKILL.md) & [blueprint/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/blueprint/SKILL.md) |
| **H. OpenRouter AI Gateway** | Memanggil model LLM (Claude, GPT, Gemini, DeepSeek), tool calling, BYOK | `openrouter-typescript-sdk` & `openrouter-models` | [openrouter-typescript-sdk/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/openrouter-typescript-sdk/SKILL.md) & [openrouter-models/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/openrouter-models/SKILL.md) |
| **I. Generate Featured Image AI** | Membuat gambar artikel via Image Generation API OpenRouter | `openrouter-images` | [openrouter-images/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/openrouter-images/SKILL.md) |
| **J. Audit & Humanisasi Artikel** | Menghilangkan jejak pola klise robotik AI pada artikel yang digenerate | `anti-ai-editor` | [anti-ai-editor/SKILL.md](file:///C:/Users/MEW/.gemini/config/skills/anti-ai-editor/SKILL.md) |
| **K. Tabel Antrean & Batch Virtual** | Sorting, filtering, paginasi, multi-row select pada tabel antrean ratusan post | `tanstack-table` | [tanstack-table/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/tanstack-table/SKILL.md) |
| **L. Optimasi Performa Next.js** | Server Components vs Client Components, bundle splitting, hydration | `vercel-react-best-practices` | [vercel-react-best-practices/SKILL.md](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/vercel-react-best-practices/SKILL.md) |

---

## 3. Protokol Eksekusi Berbasis Skill (Skill Execution Protocol)

Sebelum mengeksekusi instruksi:
1. **Identifikasi Kategori**: Tentukan pekerjaan masuk kategori A, B, C, D, E, dst.
2. **Muat Panduan Skill**: Buka dan pelajari berkas `SKILL.md` terkait menggunakan tool `view_file`.
3. **Patuhi Batasan & Best Practice**: Terapkan contoh kode, pola anti-pattern, dan konvensi penamaan yang disyaratkan oleh skill tersebut.
4. **Verifikasi Silang**: Pastikan hasil kode tidak bertentangan dengan [`PRD.md`](file:///d:/Antigravity/wp-autopost-dashboard/PRD.md), [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md), atau [`.agents/rules/security.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/security.md).
