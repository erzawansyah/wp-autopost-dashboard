---
id: "input-validator"
name: "Input Validator & Sanitizer Node"
type: "node"
version: "1.0.0"
status: "stable"
description: "Node validasi dan pembersih input untuk memastikan skema request writer valid, aman dari injeksi karakter kontrol, serta mengisi nilai default."
author: "Antigravity Engineering"
tags: ["validation", "sanitization", "zod", "security"]

side_effects:
  modifies_database: false
  calls_paid_api: false
  calls_wordpress: false

inputs:
  - name: "rawInput"
    type: "unknown"
    required: true
    description: "Payload request mentah dari antarmuka pengguna atau worker antrean."

outputs:
  - name: "isValid"
    type: "boolean"
    description: "Status keberhasilan validasi."
  - name: "sanitizedRequest"
    type: "WriterRequest"
    description: "Data request yang sudah bersih dan bertipe kuat."
  - name: "error"
    type: "object"
    description: "Detail pesan kesalahan jika validasi skema gagal."

dependencies:
  - "zod"
  - "src/core/writer/types/contracts"
---

# Input Validator & Sanitizer Node

## 1. Ikhtisar & Tujuan
Node ini bertanggung jawab sebagai gerbang masuk pertama untuk seluruh engine penulisan. Memastikan seluruh parameter masukan pengguna telah memenuhi kontrak tipe data, bebas dari karakter berbahaya atau kontrol tidak terlihat, dan memiliki nilai default yang memadai.

## 2. Cara Kerja & Alur Logika (Workflow)
1. Menerima payload mentah `rawInput`.
2. Melakukan validasi menggunakan `WriterRequestSchema.safeParse()`.
3. Jika skema tidak valid, mengembalikan status `isValid: false` beserta daftar path field yang bermasalah.
4. Jika valid, membersihkan string `keyword`, `brief`, dan `customInstructions` dari karakter kontrol `[\x00-\x1F\x7F]`.
5. Mengisi default `wordCountTarget: 800` jika tidak ditentukan.

## 3. Spesifikasi Parameter (Inputs & Options)
Menerima payload yang mencakup:
- `content.keyword` (string, wajib, 2-200 karakter)
- `site.siteId` (string, UUID)
- `publishing` (objek intent publikasi)
- Opsional: `customInstructions`, `wordCountTarget`, `model`, `apiKey`.

## 4. Spesifikasi Keluaran (Outputs)
Mengembalikan objek `InputValidatorResult`:
- `isValid: boolean`
- `sanitizedRequest?: WriterRequest`
- `error?: { code, message, details }`

## 5. Penanganan Error & Kasus Khusus (Edge Cases)
- **Field kosong atau format tidak sesuai**: Mengembalikan pesan error terstruktur tanpa melempar runtime exception yang membuat server crash.

## 6. Contoh Pemanggilan (Code Example)
```typescript
import { executeInputValidator } from "@/core/writer/nodes/input-validator"

const validation = executeInputValidator(reqBody)
if (!validation.isValid) {
  console.error(validation.error?.message)
} else {
  const request = validation.sanitizedRequest
}
```
