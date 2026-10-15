# Alur Penerbitan & Penjadwalan Bertahap

Panitera mendukung dua alur pembuatan artikel: penerbitan instan satu per satu (*Tulis Cepat*) dan pembuatan artikel masal dengan penjadwalan teratur (*Batch Ingestion & Smart Scheduling*).

---

## 1. Tulis Cepat (`/posts/new`)

Gunakan menu ini jika ingin memproduksi dan menerbitkan 1 artikel secara langsung:
1. Masukkan kata kunci atau topik artikel.
2. (Opsional) Tuliskan catatan khusus atau brief sudut pandang penulisan.
3. Pilih website WordPress target.
4. Pilih kategori dan profil agen yang ingin ditugaskan.
5. Tentukan status penerbitan:
   - **Draft**: Simpan sebagai konsep di WordPress untuk ditinjau manual sebelum tayang.
   - **Publish**: Terbitkan langsung ke website.
6. Klik **Mulai Menulis Artikel**.

---

## 2. Batch Keyword Ingestion (`/queue/new`)

Gunakan modul ini untuk mengimpor topik dalam jumlah besar:
1. **Metode Input**:
   - **File CSV/Excel**: Unggah file berisi daftar keyword beserta kolom opsional (kategori, tag, persona author).
   - **Input Teks Masal**: Masukkan daftar kata kunci satu per satu baris pada kotak teks yang tersedia.
2. **Pemetaan Kolom**: Jika menggunakan file CSV, sesuaikan kolom kata kunci utama dan kolom pendukung.
3. **Pengaturan Batch**:
   - Tentukan situs WordPress target dan profil agen penulisan.
   - Tentukan mode eksekusi: **Langsung (Immediate)** atau **Terjadwal (Smart Drip-Feed)**.
4. Klik **Kirim ke Antrean**.

---

## 3. Penjadwalan Cerdas (Smart Drip-Feed)

Untuk menjaga reputasi SEO website dan menghindari lonjakan konten yang tidak wajar, fitur penjadwalan bertahap memungkinkan Anda menyebarkan waktu publikasi:
- **Rentang Jam Aktif**: Tentukan rentang jam tayang (misalnya: pukul 08.00 s/d 21.00).
- **Interval Antar Artikel**: Atur jeda waktu penerbitan acak atau tetap (misal: setiap 2 hingga 4 jam sekali).
- **Status Future WordPress**: Artikel yang sudah selesai ditulis akan dijadwalkan secara resmi di sistem WordPress dengan status `future` sesuai waktu `post_date_gmt` masing-masing.

Semua jadwal yang aktif dapat dipantau pada menu **Artikel Terjadwal** (`/scheduled`).
