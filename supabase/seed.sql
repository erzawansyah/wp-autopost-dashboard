-- =============================================================================
-- Panitera · Seed data (dijalankan `supabase db reset`; tidak ikut `db push` kecuali --include-seed)
-- =============================================================================
-- Skill sistem bawaan `anti-ai-editor` (default skill Deep Agent, lihat
-- src/core/writer/runtime/resolve-skills.ts). Upsert idempoten pada indeks unik parsial
-- agent_skills_system_slug_key (slug, where is_system).
--
-- Konten = SKILL.md yang dulu disisipkan `.workspaces/scripts/seed-system-skills.js` dari
-- `.agents/skills/anti-ai-editor/SKILL.md` (folder lokal, di-ignore Git). Saat konflik hanya
-- name/description yang diperbarui; `content` yang sudah ada TIDAK ditimpa, sehingga versi
-- yang sudah tersimpan (mis. di production) tetap utuh bila seed ini dijalankan ke sana.
-- =============================================================================

insert into public.agent_skills (user_id, name, slug, description, content, is_system)
values (
  null,
  'anti-ai-editor',
  'anti-ai-editor',
  'Writing, auditing, repairing, and humanizing text across diverse Indonesian editorial and SEO contexts. Detects and eliminates AI writing fingerprints.',
  $skill$---
name: anti-ai-editor
description: Writing, auditing, repairing, and humanizing text across diverse Indonesian editorial and SEO contexts. Detects and eliminates AI writing fingerprints.
---

# Anti-AI Editor

Pedoman menulis, mengaudit, dan memperbaiki naskah editorial berbahasa Indonesia agar terbaca
seperti tulisan editor manusia: lugas, spesifik, dan bebas sidik jari tulisan AI. Skill ini
melengkapi aturan sistem (fakta, sumber, struktur WordPress) dan tidak pernah menggantikannya.

## Kapan dipakai

- Saat menulis draf artikel dari hasil riset.
- Saat menyunting ulang draf sebelum finalisasi (audit → perbaikan → verifikasi).
- Saat pengguna meminta gaya yang lebih natural, humanis, atau "tidak terdengar seperti AI".

## Sidik jari AI yang wajib dihapus

1. **Negasi kontrastif berulang**: "bukan hanya X, tetapi juga Y", "bukan sekadar X, melainkan Y",
   "ini bukan tentang X, ini tentang Y". Maksimal sekali per artikel, dan hanya bila kontrasnya nyata.
2. **Pembuka dan transisi klise**: "Di era digital saat ini", "Di tengah pesatnya perkembangan",
   "Tak dapat dipungkiri", "Perlu diingat bahwa", "Menariknya,", "Lebih dari itu,", "Pada akhirnya,",
   "Secara keseluruhan,", "Mari kita bahas".
3. **Metafora dan frasa kosong**: "lanskap yang terus berkembang", "memainkan peran penting",
   "menjadi kunci", "membuka pintu", "pedang bermata dua", "game changer", "solusi inovatif",
   "dunia yang serba cepat".
4. **Pola tiga serangkai otomatis**: daftar tiga kata sifat atau tiga frasa sejajar di setiap
   paragraf ("cepat, efisien, dan andal"). Gunakan jumlah butir sesuai isi, bukan ritme.
5. **Penutup bermoral atau rangkuman hambar**: paragraf akhir yang mengulang isi atau menutup
   dengan pesan motivasi. Tutup dengan keputusan, implikasi, atau langkah konkret.
6. **Pertanyaan retoris beruntun** dan sapaan berlebihan ("Pernahkah Anda bertanya-tanya...?").
7. **Hedging menumpuk**: "mungkin", "cenderung", "dapat dikatakan", "relatif" dalam satu kalimat.
8. **Tanda pisah panjang (—) dan titik dua berlebihan** sebagai penyambung kalimat.
9. **Huruf tebal bertebaran** di tengah paragraf hanya untuk penekanan.

## Prinsip menulis

- **Burstiness**: variasikan panjang kalimat. Campur kalimat pendek yang tegas dengan kalimat
  panjang yang menjelaskan sebab-akibat. Hindari paragraf yang semua kalimatnya sepanjang sama.
- **Spesifik mengalahkan umum**: ganti klaim abstrak dengan contoh, angka bersumber, nama tempat,
  atau situasi nyata. Kalau tidak ada data, bahas secara kualitatif tanpa mengarang.
- **Satu paragraf, satu gagasan**: 2–4 kalimat, kalimat pertama langsung membawa poin.
- **Kata kerja aktif**: utamakan kalimat aktif; kurangi nominalisasi ("melakukan pengecekan" →
  "mengecek", "memberikan penjelasan" → "menjelaskan").
- **Diksi Indonesia yang wajar**: pakai istilah baku KBBI bila padanannya lazim; istilah asing
  dipertahankan bila memang umum dipakai pembaca (mis. "SEO", "backlink"), dicetak miring sekali.
- **Sudut pandang editor**: tulis dengan sikap; tandai opini dan prediksi sebagai analisis,
  bukan fakta.
- **Kata kunci mengalir**: kata kunci utama dan turunannya muncul alami di judul subbab dan
  isi, tanpa pengulangan paksa.

## Alur audit dan perbaikan

1. **Pindai**: tandai setiap kemunculan pola di bagian "Sidik jari AI".
2. **Ukur ritme**: cari tiga kalimat berurutan dengan panjang serupa; pecah atau gabungkan.
3. **Tulis ulang**: ganti frasa klise dengan pernyataan spesifik; hapus kalimat yang tidak
   menambah informasi.
4. **Verifikasi fakta**: perbaikan gaya tidak boleh mengubah angka, kutipan, nama, atau sumber.
5. **Baca ulang sebagai pembaca**: pastikan pembuka langsung masuk ke inti dan penutup memberi
   arah tindakan.

## Checklist akhir

- [ ] Tidak ada pembuka meta ("Artikel ini akan membahas...") atau penutup rangkuman hambar.
- [ ] Negasi kontrastif paling banyak satu kali.
- [ ] Tidak ada frasa dari daftar klise di atas.
- [ ] Panjang kalimat bervariasi di setiap subbab.
- [ ] Setiap subbab memuat minimal satu detail spesifik (contoh, data bersumber, atau langkah).
- [ ] Tidak ada fakta, angka, atau kutipan baru yang muncul akibat penyuntingan gaya.
$skill$,
  true
)
on conflict (slug) where is_system
do update set
  name = excluded.name,
  description = excluded.description;
