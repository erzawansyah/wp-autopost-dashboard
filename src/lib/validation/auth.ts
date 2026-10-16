import { z } from "zod"

/** Skema form autentikasi (`/login`). Validasi akhir tetap di Supabase Auth. */

const EmailSchema = z
  .string({ error: "Email wajib diisi." })
  .trim()
  .min(1, "Email wajib diisi.")
  .max(254, "Email terlalu panjang.")
  .pipe(z.email({ error: "Format email tidak valid." }))

/**
 * Supabase Auth (bcrypt) membatasi kata sandi 72 byte; minimal mengikuti kebijakan proyek
 * (`supabase/config.toml` → `[auth] minimum_password_length`). Berlaku untuk daftar akun dan ganti kata sandi.
 */
export const PASSWORD_MIN_LENGTH = 6
const PASSWORD_MAX_LENGTH = 72

/** Kata sandi baru (daftar akun / ganti kata sandi). Tidak di-trim: spasi adalah bagian sah kata sandi. */
const NewPasswordSchema = z
  .string({ error: "Kata sandi wajib diisi." })
  .min(PASSWORD_MIN_LENGTH, `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`)
  .max(PASSWORD_MAX_LENGTH, `Kata sandi maksimal ${PASSWORD_MAX_LENGTH} karakter.`)

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string({ error: "Kata sandi wajib diisi." }).min(1, "Kata sandi wajib diisi."),
})
export type LoginInput = z.infer<typeof LoginSchema>

export const RegisterSchema = z
  .object({
    email: EmailSchema,
    password: NewPasswordSchema,
    confirmPassword: z.string({ error: "Ulangi kata sandi." }).min(1, "Ulangi kata sandi."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Konfirmasi kata sandi tidak cocok.",
  })
export type RegisterInput = z.infer<typeof RegisterSchema>

/** Dipakai bersama skema form/body dan pemetaan error Supabase `same_password` di server. */
export const SAME_PASSWORD_MESSAGE = "Kata sandi baru harus berbeda dari kata sandi saat ini."

const ChangePasswordFields = z.object({
  // Tanpa batas minimal kebijakan: kata sandi lama bisa dibuat sebelum kebijakan diperketat.
  currentPassword: z
    .string({ error: "Kata sandi saat ini wajib diisi." })
    .min(1, "Kata sandi saat ini wajib diisi.")
    .max(PASSWORD_MAX_LENGTH, `Kata sandi maksimal ${PASSWORD_MAX_LENGTH} karakter.`),
  newPassword: NewPasswordSchema,
})

const newPasswordDiffers = (values: { currentPassword: string; newPassword: string }) =>
  values.newPassword !== values.currentPassword

/** Body `POST /api/auth/password`. Konfirmasi kata sandi hanya divalidasi di form dan tidak dikirim ke server. */
export const ChangePasswordBodySchema = ChangePasswordFields.refine(newPasswordDiffers, {
  path: ["newPassword"],
  message: SAME_PASSWORD_MESSAGE,
})
export type ChangePasswordInput = z.infer<typeof ChangePasswordBodySchema>

/** Form "Ganti Kata Sandi" (`/settings/profile`): body + ulangi kata sandi baru. */
export const ChangePasswordFormSchema = ChangePasswordFields.extend({
  confirmPassword: z.string({ error: "Ulangi kata sandi baru." }).min(1, "Ulangi kata sandi baru."),
})
  .refine(newPasswordDiffers, { path: ["newPassword"], message: SAME_PASSWORD_MESSAGE })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Konfirmasi kata sandi tidak cocok.",
  })
export type ChangePasswordFormValues = z.infer<typeof ChangePasswordFormSchema>
