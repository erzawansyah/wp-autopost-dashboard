# Matriks Routing Skill

Skill proyek ada di `.claude/skills/`. Muat skill yang sesuai **sebelum** mulai mengerjakan jenis pekerjaan berikut:

| Jenis pekerjaan | Skill |
| :--- | :--- |
| Komponen React, data fetching, performa Next.js App Router | `vercel-react-best-practices` |
| Arsitektur/API komponen yang dapat dipakai ulang (compound, context, props) | `vercel-composition-patterns` |
| Menambah atau memodifikasi komponen Radix/shadcn | `shadcn` |
| Token desain, tema, utilitas Tailwind v4 | `tailwind-design-system` |
| Tabel data antrean/batch (sorting, filter, seleksi) | `tanstack-table` |
| Supabase Auth SSR, client, Realtime, Storage | `supabase` |
| Membuat/mengubah migrasi Supabase, RLS, dan test DB proyek ini | `panitera-db-migration` + `supabase-postgres-best-practices` |
| Skema, RLS policy, indeks, query Postgres (prinsip umum) | `supabase-postgres-best-practices` |
| Agent LangChain (`createAgent`, tools, structured output) | `langchain-fundamentals` |
| Middleware agen (loop guard, HITL, wrapToolCall) | `langchain-middleware` |
| StateGraph / streaming LangGraph | `langgraph-fundamentals` |
| Deep Agent (`createDeepAgent`, subagent, skills, konfigurasi harness) | `deep-agents-core` |
| Backend/memori Deep Agent (StateBackend, StoreBackend, CompositeBackend) | `deep-agents-memory` |
| Versi & instalasi paket `@langchain/*` | `langchain-dependencies` |
| Request/respons WordPress REST API, Application Passwords | `wp-rest-api` |
| Uji posting ke WordPress lokal yang aman (sandbox) | `wp-playground` |
| Menulis/meninjau Blueprint JSON WordPress Playground (fixture uji) | `blueprint` |
| Verifikasi sebelum menyatakan selesai / sebelum minta izin commit | `panitera-verify` |

Catatan:
- Beberapa skill pihak ketiga memuat contoh Python; proyek ini TypeScript, jadi pakai padanan JS/TS (`@langchain/*`, `langchain`, `deepagents`).
- `blueprint` dan `wp-playground` hanya untuk sandbox uji lokal. Langkah seperti `installPlugin`/mu-plugin di Blueprint tidak boleh menjadi syarat fitur di situs WordPress pengguna (*Zero-Friction Onboarding*).
- `deep-agents-memory`: jangan memakai `FilesystemBackend` di server web (sesuai peringatan skill); runtime Panitera memakai `ReadOnlyStoreBackend` (turunan `StoreBackend`) di `src/core/writer/runtime/build-agent.ts`.
