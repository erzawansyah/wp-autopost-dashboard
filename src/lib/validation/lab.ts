import { z } from "zod"
import { optionalText, requiredText } from "./common"

/** Nilai pemilih situs Lab untuk "tanpa WordPress" (Radix Select tidak menerima nilai kosong). */
export const LAB_NO_SITE = "none"

/**
 * Form uji Agent Profile di Laboratorium (`/lab`, tab Agent Profile). Body `POST /api/lab/run` dibentuk
 * dari keluarannya (`type: "agent"`, `params`); status publikasi selalu draft (draft-first).
 */
export const LabAgentRunFormSchema = z.object({
  profileRef: requiredText("Pilih Agent Profile yang akan diuji.", 100),
  siteId: z.string(),
  language: requiredText("Pilih bahasa artikel.", 10),
  keyword: requiredText("Kata kunci utama wajib diisi.", 200),
  brief: optionalText(2000),
})

export type LabAgentRunFormValues = z.input<typeof LabAgentRunFormSchema>
export type LabAgentRunFormOutput = z.output<typeof LabAgentRunFormSchema>
