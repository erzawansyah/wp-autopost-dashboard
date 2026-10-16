# Tulis Cepat, Tulis Massal & Penjadwalan

Panitera menyediakan tiga cara membuat artikel. Ketiganya hanya mencatat artikel ke antrean; penulisan dan pengiriman ke WordPress dikerjakan di latar belakang, jadi halaman boleh ditutup setelah mengirim.

| Menu | Untuk | Jumlah |
| :--- | :--- | :--- |
| **Tulis Cepat** (`/posts/new`) | Satu artikel dari satu topik | 1 artikel |
| **Tulis Massal** (`/queue`) | Daftar kata kunci, satu baris satu artikel | Maks. 50 per batch |
| **Tulis Terstruktur** (`/write/structured`) | Data tabel dengan kolom judul, LSI, fokus, dan tag | Maks. 50 baris per batch |

Ketiga formulir memiliki tab **Wajib** dan **Lanjutan**. Angka di tab **Lanjutan** menunjukkan jumlah opsi lanjutan yang sudah diisi. Pastikan kunci OpenRouter sudah tersimpan di [Pusat Kunci API](/settings/keys); tanpa kunci, artikel akan berstatus **Gagal Tulis**.

---

## 1. Tulis Cepat

Tab **Wajib (cepat)**:

1. **Website WordPress target**: website berstatus **Kredensial ditolak** disembunyikan sampai disambungkan ulang.
2. **Agent Profile**: profil default Anda terpilih otomatis.
3. **Bahasa artikel**: bawaan Bahasa Indonesia.
4. **Topik atau kata kunci utama**.
5. **Status Penerbitan**: **Simpan Draf** (aman ditinjau dulu, bawaan) atau **Langsung Terbit**.

Tab **Lanjutan** (opsional):

- **Kategori WordPress**: satu atau beberapa kategori dari website target. Kosong berarti AI memilihkan kategori yang paling sesuai dari kategori yang sudah ada.
- **Tag WordPress**: pisahkan dengan koma. Tag dicocokkan atau dibuat otomatis di WordPress.
- **Catatan khusus atau sudut pandang**: arahan tambahan untuk AI.

Klik **Tulis & simpan ke draf** (atau **Tulis & langsung terbitkan**). Setelah muncul konfirmasi **Artikel berhasil masuk antrean latar belakang**, Anda dialihkan ke Dashboard. Tombol **Kosongkan formulir** mengembalikan isian ke awal.

---

## 2. Tulis Massal

1. Pilih **Website WordPress target**, **Agent Profile**, dan **Bahasa artikel**.
2. Isi **Daftar kata kunci target (1 baris = 1 kata kunci)**. Penghitung menampilkan jumlah kata kunci (maks. 50); baris kosong diabaikan, dan tombol **Hapus N duplikat** muncul bila ada baris ganda.
3. Atur **Strategi jadwal tayang** (lihat bagian 4) dan periksa **Pratinjau jadwal tayang**.
4. Opsional di tab **Lanjutan**: **Nama batch** (kosong = nama otomatis dari kata kunci pertama), **Kategori WordPress (seluruh batch)**, **Tag WordPress (seluruh batch)**, dan **Instruksi khusus / sudut pandang penulis**.
5. Klik **Tulis N artikel sekarang** (eksekusi langsung) atau **Jadwalkan N artikel bertahap**.

Setelah banner **Batch berhasil masuk antrean**, Anda dibawa ke halaman Antrean yang tersaring ke batch tersebut.

---

## 3. Tulis Terstruktur

Gunakan menu ini bila setiap artikel butuh data berbeda, misalnya judul spesifik atau kata kunci sekunder.

1. Pilih website, Agent Profile, dan bahasa seperti di atas.
2. Masukkan data di **Data input (CSV / TSV / tabel)**: tab **Tempel teks** untuk menempel CSV atau sel dari Excel/Google Sheets, atau tab **Unggah berkas** untuk berkas `.csv`, `.tsv`, atau `.txt`. Berkas `.xlsx` tidak dibaca langsung; salin selnya lalu tempel.
3. Periksa panel **Pemetaan kolom otomatis**: pastikan **Pemisah terdeteksi** sudah benar, centang **Baris pertama adalah nama kolom (header)** bila ada judul kolom, lalu sesuaikan fungsi tiap kolom. Klik **Lihat pratinjau data** untuk memeriksa hasil uraian per baris.
4. Atur strategi jadwal, lalu klik **Buat & jadwalkan N artikel terstruktur**.

Fungsi kolom yang tersedia:

| Fungsi kolom | Pengaruh ke artikel |
| :--- | :--- |
| **Kata kunci utama (topik)** | Topik artikel. Bila kosong, judul dipakai sebagai topik. |
| **Judul artikel (title)** | Judul H1 spesifik; kosong berarti judul dibuat AI. |
| **Kata kunci sekunder (LSI)** | Istilah yang wajib dibahas secara natural. |
| **Fokus pembahasan / brief** | Arahan sudut pandang khusus untuk baris tersebut. |
| **Tag WordPress** | Tag khusus baris, digabung dengan tag default batch. |
| **Kategori WordPress** | Nama kategori yang **sudah ada** di website (dicocokkan dengan nama atau slug, huruf besar/kecil diabaikan) dan dipakai untuk baris itu, mengalahkan **Kategori WordPress default** di tab Lanjutan. Panitera tidak membuat kategori baru: bila nama tidak ditemukan, artikel memakai kategori default batch (atau dipilih AI bila kosong) dan peringatan tercatat di **Log aktivitas** artikel. Artikel yang masih menunggu di antrean saat versi ini dipasang juga ikut memakai kategori barisnya. |
| **Abaikan kolom ini** | Kolom tidak diproses. |

Tips data:

- Gunakan satu jenis pemisah kolom secara konsisten. Pemisah dipilih dari karakter yang membagi setiap baris (terutama baris header) menjadi jumlah kolom yang sama. Tempelan langsung dari spreadsheet (pemisah tab) paling aman.
- Beberapa LSI atau tag dalam satu sel dipisahkan dengan garis tegak (`|`), koma, atau titik koma. Bila kolom dipisah koma, pakai `|` di dalam sel (seperti tombol **Contoh cepat**) atau apit sel dengan tanda kutip ganda (`"a, b, c"`).
- Tab **Lanjutan** berisi **Nama batch**, **Kategori WordPress default (opsional)**, **Tag WordPress default (opsional)**, dan **Instruksi khusus / sudut pandang penulis** yang berlaku untuk semua baris.

---

## 4. Strategi Jadwal Tayang (Drip-Feed)

Tulis Massal dan Tulis Terstruktur memakai panel **Strategi jadwal tayang** yang sama.

**Eksekusi langsung (tulis semua sekarang)** — sakelar **Langsung/Bertahap**:

- **Langsung** (bawaan): AI langsung menulis semua artikel di antrean. Tanggal tayang di WordPress tetap mengikuti jadwal.
- **Bertahap**: AI baru menulis setiap artikel sekitar 10 menit sebelum jam tayangnya, sehingga naskah tetap segar dan biaya tersebar.

**Pola jadwal tayang**:

- **Pola Interval**: isi **Waktu mulai (artikel pertama)** dan **Jeda antar artikel (jam)** (1–720 jam, bawaan 12). Centang variasi acak agar jam tayang tidak selalu tepat di menit :00; mulai artikel kedua, jadwal digeser 5–10 menit lebih awal atau lebih lambat secara acak. Pratinjau menampilkan contoh pergeseran; menit pastinya diacak ulang saat batch dibuat.
- **Tanggal Acak**: isi **Mulai dari** dan **Sampai dengan**. Rentang dibagi rata sesuai jumlah artikel, lalu setiap artikel mendapat waktu acak di bagiannya.

**Status di WordPress**:

- **Langsung Terbit** (bawaan untuk batch): artikel yang jadwalnya masih di masa depan dikirim sebagai **terjadwal** (status `future`), sehingga WordPress sendiri yang menayangkannya tepat waktu. Bila jadwal sudah lewat saat dikirim, artikel langsung terbit.
- **Simpan Draf**: artikel disimpan sebagai draf di WordPress.

**Pratinjau jadwal tayang** menampilkan empat slot pertama dan slot terakhir dalam zona waktu WIB. Jadwal final dihitung ulang server saat batch dibuat, jadi menit acaknya bisa sedikit berbeda dari pratinjau.

Artikel terjadwal dipantau di menu **Antrean** dengan filter **Terjadwal** dan kolom **Waktu & Publikasi**. Lihat [Antrean, Status & Kirim Ulang](/docs?doc=06-antrean-dan-status-artikel).
