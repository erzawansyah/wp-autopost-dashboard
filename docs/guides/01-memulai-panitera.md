# Memulai Panitera: Publishing Desk

**Panitera** adalah platform penerbitan konten multi-situs WordPress yang mengintegrasikan kecerdasan buatan (*AI Writer Agents*), riset kata kunci dan data faktual, kurasi foto bebas royalti, serta penjadwalan penerbitan bertahap (*smart scheduling*).

---

## 1. Konsep Utama

1. **Multi-Tenant & Multi-Site**: Kelola banyak website WordPress dari satu dasbor terpusat tanpa perlu login berulang kali ke masing-masing wp-admin.
2. **Koneksi Zero-Plugin**: Tidak memerlukan instalasi plugin tambahan di sisi WordPress. Komunikasi berjalan murni melalui standar resmi **WordPress REST API** dan **Application Passwords**.
3. **Bawa Kunci API Sendiri (BYOK)**: Dasbor ini sepenuhnya mendukung model BYOK (*Bring Your Own Key*) untuk penyedia AI (OpenRouter) dan pencarian web/gambar. Anda memegang kendali penuh atas kuota dan biaya API Anda.

---

## 2. Langkah Awal Pengaturan

Sebelum mulai menerbitkan artikel, selesaikan 2 langkah dasar berikut:

### A. Pengaturan Kunci API (BYOK)
Buka menu **Pengaturan ➔ Kunci API** (`/settings/keys`):
- **OpenRouter API Key**: Kunci utama untuk model bahasa AI (Llama 3.3 70B, Claude, GPT-4o, DeepSeek, dsb.).
- **Web Search Provider**: Masukkan API key untuk Tavily, Brave, SerpAPI, atau gunakan instance SearXNG lokal (`http://localhost:8080`).
- **Pexafy API Key**: Kunci pencarian foto berkualitas tinggi bebas royalti.

### B. Hubungkan Website WordPress Pertama Anda
Buka menu **Daftar Website** (`/sites`) dan klik **Sambungkan Website**:
- Tab **Otomatis (disarankan)**: masukkan URL situs WordPress (contoh: `https://bloganda.com`), klik **Hubungkan ke WordPress**, lalu tekan **Setujui** di halaman WordPress. Anda kembali ke Panitera dan website langsung tersambung.
- Tab **Input Manual**: isi URL, Username WordPress, dan Application Password (dibuat di menu *Users ➔ Profile* pada wp-admin), klik **Cek Koneksi**, lalu **Simpan Website**.

---

## 3. Fitur Utama Dasbor

- **Tulis Cepat (`/posts/new`)**: Tulis 1 artikel instan dengan memilih topik, target website, kategori, dan profil agen.
- **Batch Keyword Ingestion (`/queue/new`)**: Unggah puluhan hingga ratusan kata kunci melalui CSV atau input teks masal untuk diproses otomatis.
- **Antrean Penerbitan (`/queue/items`)**: Pantau status eksekusi artikel dari draf riset hingga terbit ke WordPress.
- **Artikel Terjadwal (`/scheduled`)**: Kalender dan daftar artikel yang dijadwalkan tayang bertahap.
- **Profil Agen (`/agents`)**: Kustomisasi instruksi gaya bahasa, pemilihan alat (tools), dan keahlian editorial (*SKILL.md*).
- **WP Tools (`/tools`)**: Asisten AI untuk internal link building retroaktif, perancangan author E-E-A-T, dan perancangan taksonomi kategori.
- **Laboratorium Pengujian (`/lab`)**: Lingkungan uji coba mandiri untuk mencoba tool atau pipeline agen sebelum digunakan di produksi.
