/**
 * Template contoh Tulis Terstruktur (tombol "Contoh cepat"). Kolom dipisah koma; beberapa LSI dalam satu sel dipisah
 * garis tegak (`|`). Setiap template diuji terurai benar (kolom, header, LSI) di `universal-batch-parser.test.ts`.
 */
export interface StructuredBatchTemplate {
  /** Label tombol = baris header template. */
  name: string
  desc: string
  text: string
}

export const STRUCTURED_BATCH_TEMPLATES: readonly StructuredBatchTemplate[] = [
  {
    name: "keyword, lsi",
    desc: "Topik utama & kata kunci sekunder",
    text: `keyword, lsi
resep nasi goreng, bumbu nasi goreng | kecap manis | nasi pera
cara merawat aglaonema, media tanam | pupuk daun | sinar matahari
rekomendasi coffee shop jakarta, manual brew | kopi susu | tempat nongkrong`,
  },
  {
    name: "keyword, lsi, judul",
    desc: "Topik, variasi LSI, dan judul H1 siap pakai",
    text: `keyword, lsi, judul
wisata jogja, malioboro | heha sky view | prambanan, 10 Tempat Wisata Jogja Paling Populer dan Hits 2026
laptop murah, ram 8gb | ssd nvme | baterai awet, Rekomendasi Laptop Murah Terbaik untuk Mahasiswa & Kerja
diet sehat, defisit kalori | intermitten fasting | menu sayur, Panduan Diet Sehat Alami Tanpa Olahraga Berat`,
  },
  {
    name: "judul, second keyword, fokus",
    desc: "Judul artikel, kata kunci sekunder, & arahan sudut pandang",
    text: `judul, second keyword, fokus
Panduan Lengkap SEO On-Page untuk Pemula, meta tag | internal link | struktur url, Bahas teknis praktis tanpa istilah rumit
Strategi Memulai Bisnis Kopi Susu Kekinian, modal awal | pemilihan cup | supplier biji, Sertakan simulasi modal dan perhitungan BEP
Cara Meningkatkan Penjualan di Marketplace, optimasi gambar | iklan flash sale | review, Fokus pada tips konversi untuk toko baru`,
  },
]
