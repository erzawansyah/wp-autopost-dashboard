# Direktori Skills Workspace (`.agents/skills/`)

Direktori ini adalah tempat penyimpanan **Skills** khusus proyek hasil instalasi dari registry eksternal seperti [`skills.sh`](https://skills.sh) maupun skill custom internal.

Setiap skill di folder ini otomatis dimuat oleh Google Antigravity dengan prioritas tertinggi (**Workspace Project Priority**).

---

## 1. Daftar Skill Aktif di Workspace Ini (11 Skill)

| Nama Skill | Sumber | Deskripsi & Fungsi |
| :--- | :--- | :--- |
| **[`tanstack-table`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/tanstack-table/SKILL.md)** | `tanstack-skills/tanstack-skills` | Standar implementasi `@tanstack/react-table`: multi-row selection, column pinning, virtual scrolling, server-side sorting, dan pagination antrean batch. |
| **[`tailwind-design-system`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/tailwind-design-system/SKILL.md)** | `wshobson/agents` | Arsitektur Tailwind CSS v4 CSS-first (`@theme`), token warna semantik OKLCH, varian `@custom-variant dark`, dan animasi CSS native. |
| **[`ui-ux-pro-max`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/ui-ux-pro-max/SKILL.md)** | `nextlevelbuilder/ui-ux-pro-max-skill` | Inteligensi desain UI/UX (79 gaya, 192 palet warna, 74 font pairings, 119 UX guidelines) untuk membaca & menerapkan [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md). |
| **[`shadcn`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/shadcn/SKILL.md)** | `shadcn-ui/ui` | Registrasi komponen Radix UI + Tailwind, CLI generator, debugging styling & preset. |
| **[`supabase`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/supabase/SKILL.md)** | `supabase/agent-skills` | Integrasi Supabase `@supabase/ssr` di Next.js App Router, cookie/sesi auth, Supabase Realtime, dan troubleshooting client/server. |
| **[`supabase-postgres-best-practices`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/supabase-postgres-best-practices/SKILL.md)** | `supabase/agent-skills` | Best practice resmi Postgres: desain skema, migrasi SQL aman, kebijakan Row Level Security (RLS) multi-tenant, dan indexing antrean. |
| **[`vercel-react-best-practices`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/vercel-react-best-practices/SKILL.md)** | `vercel-labs/agent-skills` | Panduan performa resmi dari Vercel Engineering untuk Next.js App Router, Server Components (RSC), data fetching, dan optimasi bundle. |
| **[`vercel-composition-patterns`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/vercel-composition-patterns/SKILL.md)** | `vercel-labs/agent-skills` | Pola arsitektur komponen React yang scalable (compound components, reusable provider APIs, React 19 standards). |
| **[`wp-rest-api`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/wp-rest-api/SKILL.md)** | `WordPress/agent-skills` | Dokumentasi dan standar penanganan WordPress REST API endpoints, otentikasi Application Passwords, pagination, sanitasi data, dan respons error. |
| **[`wp-playground`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/wp-playground/SKILL.md)** | `WordPress/agent-skills` | Menjalankan instance WordPress lokal instan berbasis WebAssembly/Node (`@wp-playground/cli`) untuk sandbox pengujian posting tanpa server fisik. |
| **[`blueprint`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/blueprint/SKILL.md)** | `WordPress/agent-skills` | Pembuatan dan validasi Blueprint JSON untuk mengonfigurasi user dan kredensial uji coba otomatis di WP Playground. |

---

## 2. Skill Eksternal & Global yang Tersedia

- **Editorial & Humanizer**: `anti-ai-editor` (Global — otomatis dipanggil saat men-generate atau mengaudit artikel Bahasa Indonesia agar natural dan bebas jejak AI).
- **SEO & Keyword Intelligence**: `keyword-research`, `keyword-clustering`, `competitor-analysis` (Global).
- **Developer MCP Tooling**: Supabase, Next-DevTools, dan Fetch (`.agents/mcp_config.json`).

---

## 3. Cara Meng-install Skill Baru

Jalankan perintah berikut melalui terminal:

```bash
# Menambahkan skill dari skills.sh ke workspace ini
npx skills add <owner/repo> --skill <nama-skill> -y
```
