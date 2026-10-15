Tutorial ini menunjukkan cara membuat skrip kecil untuk mencatat stok biji kopi. Semua contoh bisa dijalankan di terminal.

## Menyiapkan Proyek

Pasang dependensi lalu buat berkas `stok.js`. Elemen pertama larik diakses dengan `stok[0]`.

```bash
npm init -y
npm install dayjs
```

## Menulis Skrip

```js
const stok = [{ nama: "Gayo", kg: 12 }]

// Penulis: tim gudang — revisi [1]
function cetak(item) {
  console.log(`${item.nama}\t${item.kg} kg\n`)
}

stok.forEach(cetak)
```

### Versi Python

```python
def total(stok):
    jumlah = 0
    for item in stok:  # dua  spasi
        jumlah += item["kg"]
    return jumlah
```

Baris yang diawali `#` di dalam kode tidak dianggap heading:

```text
## Kesimpulan
# Judul
Penulis: Bukan Byline
x — y
```

Gunakan `printf("%s\n", nama)` untuk mencetak satu baris.
