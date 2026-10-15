"use client"

import * as React from "react"

/**
 * Konfirmasi berbasis dialog (pengganti `window.confirm()`), dirender oleh `ConfirmProvider`
 * (`src/components/providers/confirm-provider.tsx`, sudah terpasang di `AppProviders`).
 *
 *   const confirm = useConfirm()
 *   async function handleDelete() {
 *     const ok = await confirm({
 *       title: `Hapus website "${site.site_name}"?`,
 *       description: "Antrean artikel yang tersambung ke website ini ikut terhapus.",
 *       confirmLabel: "Hapus",
 *       tone: "destructive",
 *     })
 *     if (!ok) return
 *     deleteSite.mutate(site.id)
 *   }
 */

export interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  /** Default "Lanjutkan" (atau "Hapus" untuk tone destructive). */
  confirmLabel?: string
  /** Default "Batal". */
  cancelLabel?: string
  /** `destructive` untuk aksi yang tidak dapat dibatalkan (hapus, reset). */
  tone?: "default" | "destructive"
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = React.createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const confirm = React.use(ConfirmContext)
  if (!confirm) {
    throw new Error("useConfirm() harus dipakai di dalam <ConfirmProvider> (AppProviders).")
  }
  return confirm
}
