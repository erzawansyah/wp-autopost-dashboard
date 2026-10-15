"use client"

import * as React from "react"
import { X } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { cn } from "@/lib/utils"

interface DismissibleAlertProps {
  variant: NonNullable<React.ComponentProps<typeof Alert>["variant"]>
  /** Ikon dekoratif sebagai elemen (`<CheckCircle2 aria-hidden="true" />`) — elemen aman dioper dari Server Component. */
  icon?: React.ReactNode
  title: string
  /** Deskripsi & aksi (mis. `<Button asChild><Link/></Button>`). */
  children?: React.ReactNode
  /**
   * Parameter query yang dihapus dari address bar saat banner tampil (mis. hasil redirect `?auth_status=`),
   * agar muat ulang/berbagi tautan tidak memunculkan banner lagi. Memakai `history.replaceState` (tanpa
   * navigasi/refetch RSC), jadi banner tetap tampil sampai ditutup.
   */
  clearSearchParams?: readonly string[]
  className?: string
}

/** Callout `Alert` yang bisa ditutup — untuk pemberitahuan hasil redirect/aksi sebelumnya. */
export function DismissibleAlert({ variant, icon, title, children, clearSearchParams, className }: DismissibleAlertProps) {
  const [open, setOpen] = React.useState(true)
  const paramsKey = clearSearchParams?.join(",") ?? ""

  React.useEffect(() => {
    if (!paramsKey) return
    const url = new URL(window.location.href)
    const keys = paramsKey.split(",").filter((key) => url.searchParams.has(key))
    if (keys.length === 0) return
    for (const key of keys) url.searchParams.delete(key)
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [paramsKey])

  if (!open) return null

  return (
    <Alert variant={variant} role={variant === "destructive" ? "alert" : "status"} className={cn("pr-10", className)}>
      {icon}
      <AlertTitle>{title}</AlertTitle>
      {children && <AlertDescription>{children}</AlertDescription>}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Tutup pemberitahuan"
        onClick={() => setOpen(false)}
        className="absolute top-2 right-2 cursor-pointer text-current hover:bg-current/10 hover:text-current"
      >
        <X aria-hidden="true" />
      </Button>
    </Alert>
  )
}
