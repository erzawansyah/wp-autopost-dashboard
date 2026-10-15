Tabel `pengguna` menyimpan profil pelanggan kedai. Kolom **indeks** utama dijelaskan di bawah.

Kolom: `user_id_1`, `user_id_2`, `user_id_3`, `user_id_4`, `user_id_5`, `user_id_6`, `user_id_7`, `user_id_8`, `user_id_9`, `user_id_10`, `user_id_11`, `user_id_12`, `user_id_13`, `user_id_14`, `user_id_15`, `user_id_16`, `user_id_17`, `user_id_18`, `user_id_19`, `user_id_20`, `user_id_21`, `user_id_22`, `user_id_23`, `user_id_24`, `user_id_25`, `user_id_26`, `user_id_27`, `user_id_28`, `user_id_29`, `user_id_30`, `user_id_31`, `user_id_32`, `user_id_33`, `user_id_34`, `user_id_35`, `user_id_36`, `user_id_37`, `user_id_38`, `user_id_39`, `user_id_40`, `user_id_41`, `user_id_42`, `user_id_43`, `user_id_44`, `user_id_45`, `user_id_46`, `user_id_47`, `user_id_48`, `user_id_49`, `user_id_50`, `user_id_51`, `user_id_52`, `user_id_53`, `user_id_54`, `user_id_55`, `user_id_56`, `user_id_57`, `user_id_58`, `user_id_59`, `user_id_60`, `user_id_61`, `user_id_62`, `user_id_63`, `user_id_64`, `user_id_65`, `user_id_66`, `user_id_67`, `user_id_68`, `user_id_69`, `user_id_70`, `user_id_71`, `user_id_72`, `user_id_73`, `user_id_74`, `user_id_75`, `user_id_76`, `user_id_77`, `user_id_78`, `user_id_79`, `user_id_80`, `user_id_81`, `user_id_82`, `user_id_83`, `user_id_84`, `user_id_85`, `user_id_86`, `user_id_87`, `user_id_88`, `user_id_89`, `user_id_90`, `user_id_91`, `user_id_92`, `user_id_93`, `user_id_94`, `user_id_95`, `user_id_96`, `user_id_97`, `user_id_98`, `user_id_99`, `user_id_100`, `user_id_101`, `user_id_102`, `user_id_103`, `user_id_104`, `user_id_105`.

## Relasi

- `pesanan.user_id` merujuk `pengguna.id` dengan *cascade* saat dihapus.
- Indeks gabungan `(kedai_id, dibuat_pada)` mempercepat laporan harian.

| Kolom | Tipe | Keterangan |
| :--- | :---: | ---: |
| `user_id` | `bigint` | **wajib** |
| `nama_lengkap` | `text` | opsional |

Puisi barista:
                                                            seduh perlahan, nikmati aromanya
