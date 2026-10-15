"use client"

import * as React from "react"
import { ConfirmDialog } from "@/components/molecules/confirm-dialog"
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from "@/lib/ui/confirm"

interface PendingConfirm {
  options: ConfirmOptions
  resolve: (confirmed: boolean) => void
}

/**
 * Satu `ConfirmDialog` bersama untuk seluruh aplikasi; `useConfirm()` membukanya dan menunggu jawaban.
 * Permintaan baru saat dialog masih terbuka menutup permintaan lama sebagai "batal".
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null)
  const [open, setOpen] = React.useState(false)
  const pendingRef = React.useRef<PendingConfirm | null>(null)

  const settle = React.useCallback((confirmed: boolean) => {
    pendingRef.current?.resolve(confirmed)
    pendingRef.current = null
    setOpen(false)
  }, [])

  const confirm = React.useCallback<ConfirmFn>((options) => {
    pendingRef.current?.resolve(false)
    return new Promise<boolean>((resolve) => {
      const next = { options, resolve }
      pendingRef.current = next
      setPending(next)
      setOpen(true)
    })
  }, [])

  return (
    <ConfirmContext value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          {...pending.options}
          open={open}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) settle(false)
          }}
          onConfirm={() => settle(true)}
        />
      )}
    </ConfirmContext>
  )
}
