import * as React from "react"
import Link from "next/link"
import { History, ListChecks, Plus } from "lucide-react"
import { Button } from "@/components/atoms/button"

export type BatchModuleLink = "batches" | "items" | "create"

interface BatchModuleActionsProps {
  /** Tautan navigasi yang ditampilkan (halaman saat ini tidak perlu menautkan dirinya sendiri). */
  show: BatchModuleLink[]
  /** Tombol tambahan khusus halaman, ditampilkan paling kiri. */
  children?: React.ReactNode
}

/**
 * Aksi header standar modul Tulis Cepat/Massal/Terstruktur, Daftar Batch, dan Antrean (isi `PageHeader.actions`).
 * Hanya tautan — aman dirender dari Server Component. Urutan, label, dan gaya tombol sama di semua halaman.
 */
export function BatchModuleActions({ show, children }: BatchModuleActionsProps) {
  return (
    <>
      {children}

      {show.includes("batches") && (
        <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
          <Link href="/batches">
            <History aria-hidden="true" className="size-3.5 text-muted-foreground" />
            Daftar Batch
          </Link>
        </Button>
      )}

      {show.includes("items") && (
        <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
          <Link href="/queue/items">
            <ListChecks aria-hidden="true" className="size-3.5 text-muted-foreground" />
            Antrean
          </Link>
        </Button>
      )}

      {show.includes("create") && (
        <Button size="sm" asChild className="gap-1.5 text-xs font-semibold shadow-xs">
          <Link href="/queue">
            <Plus aria-hidden="true" className="size-3.5" />
            Tulis Massal
          </Link>
        </Button>
      )}
    </>
  )
}
