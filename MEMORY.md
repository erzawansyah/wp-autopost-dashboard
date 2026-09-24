# MEMORY.md — Living Project Memory & State Index

Dokumen ini adalah **Memori Dinamis Proyek (Living Memory)** untuk seluruh AI Agent. Berbeda dengan [`AGENTS.md`](file:///d:/Antigravity/wp-autopost-dashboard/AGENTS.md) yang bersifat statik/kebijakan, file ini mencatat status terkini proyek, riwayat keputusan arsitektur (*ADR*), dan catatan teknis penting (*gotchas*) agar tidak terulang di sesi berikutnya.

---

## 1. Status Proyek Saat Ini

- **Tahap Aktif**: **Penyiapan & Modifikasi Ekosistem Agent (`.agents/`)**
- **Kondisi**: Masih berlangsung. Belum masuk ke tahap implementasi/scaffolding aplikasi Next.js.
- **Catatan Worklog Aktif**: [`00-agent-setup.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/00-agent-setup.md)
- **Fase/Workflow Selanjutnya**: Menunggu arahan, penentuan prioritas, dan kesepakatan alur kerja dari Pengguna.

---

## 2. Catatan Keputusan Arsitektur yang Telah Disepakati (ADR Summary)

1. **ADR-001 (Root Installation dengan `src/`)**:
   - Next.js akan di-install di root workspace dengan opsi direktori `src/` (menolak subdirektori `./app`) demi kelancaran tooling Shadcn, Tailwind, dan Next.js App Router.
2. **ADR-002 (Zero-Plugin WP Onboarding)**:
   - Integrasi WordPress murni di atas REST API standar (`/wp-json/wp/v2/`) + Application Passwords bawaan. Dilarang mengharuskan pengguna memasang plugin custom di WordPress mereka.
3. **ADR-003 (OpenRouter-First + Pluggable BYOK)**:
   - OpenRouter menjadi gateway default sistem; arsitektur dibuat modular (`AIProviderAdapter`) agar pengguna dapat memasukkan API Key sendiri.
4. **ADR-004 (Cost-Saver State Machine Retry)**:
   - Status antrean memisahkan `failed_generation` (error AI) dan `failed_sync` (error WP). Retry koneksi WP langsung mengulang dari `ready_to_sync` tanpa memanggil ulang LLM.
5. **ADR-005 (Developer-Centric MCPs)**:
   - MCP Server di `.agents/mcp_config.json` dibatasi hanya untuk alat bantu developer (`supabase`, `next-devtools`, `fetch`). API aplikasi (DataForSEO & Pexels) diisolasi di level kode runtime.
6. **ADR-006 (Elevasi DESIGN.md & ARCHITECTURE.md ke Root)**:
   - Mengikuti konvensi industri Google Stitch / `ui-ux-pro-max`, `DESIGN.md` dan `ARCHITECTURE.md` diletakkan di root repositori.

---

## 3. Technical Gotchas & Pelajaran Lapangan

- **Windows File Locking**: Di OS Windows, direktori kustomisasi yang sedang dipantau oleh *file watcher* IDE dapat terkunci (*EBUSY*). Jika folder kosong perlu dihapus, lakukan lewat file explorer IDE atau saat restart.
- **Strict No-Commit Secrets**: File `.env.local` atau dump kredensial situs WP nyata tidak boleh ter-track oleh Git.
- **User Communication Preference**: Bahasa Indonesia yang jelas, profesional, ringkas, tanpa basa-basi berlebihan (*no fluff*), tidak membuat asumsi sepihak, dan kode yang rapi sesuai konvensi.

---

## 4. Protokol Pembaruan Memori (Agent Maintenance Protocol)

Setiap Agent yang menyelesaikan pekerjaan atau mencatat kesepakatan baru **WAJIB**:
1. Menjaga ukuran file `MEMORY.md` ini tetap ramping (di bawah 100 baris).
2. Mendiskusikan dan menyepakati penentuan fase atau workflow berikutnya dengan Pengguna sebelum mencatatnya sebagai rencana tetap.
3. Menuliskan catatan teknis detail ke dalam file worklog di [`.agents/worklogs/`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/).
