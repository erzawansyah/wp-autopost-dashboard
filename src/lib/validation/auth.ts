import { z } from "zod"

/** Skema form autentikasi (`/login`). Validasi akhir tetap di Supabase Auth. */

const EmailSchema = z
  .string({ error: "Email wajib diisi." })
  .trim()
  .min(1, "Email wajib diisi.")
  .max(254, "Email terlalu panjang.")
  .pipe(z.email({ error: "Format email tidak valid." }))

/** Supabase Auth (bcrypt) membatasi kata sandi 72 byte; minimal mengikuti kebijakan proyek. */
export const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 72

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string({ error: "Kata sandi wajib diisi." }).min(1, "Kata sandi wajib diisi."),
})
export type LoginInput = z.infer<typeof LoginSchema>

export const RegisterSchema = z
  .object({
    email: EmailSchema,
    password: z
      .string({ error: "Kata sandi wajib diisi." })
      .min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`)
      .max(PASSWORD_MAX_LENGTH, `Kata sandi maksimal ${PASSWORD_MAX_LENGTH} karakter.`),
    confirmPassword: z.string({ error: "Ulangi kata sandi." }).min(1, "Ulangi kata sandi."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Konfirmasi kata sandi tidak cocok.",
  })
export type RegisterInput = z.infer<typeof RegisterSchema>
