"use client"

import * as React from "react"
import Link from "next/link"
import { History, ListChecks, Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/atoms/button"

export type BatchModuleLink = "batches" | "items" | "create"

interface BatchModuleActionsProps {
  /** Tautan navigasi yang ditampilkan (halaman saat ini tidak perlu menautkan dirinya sendiri) */
  show: BatchModuleLink[]
  onRefresh?: () => void
  isRefreshing?: boolean
  /** Tombol tambahan khusus halaman, ditampilkan paling kiri */
  children?: React.ReactNode
}

/**
 * Aksi header standar untuk modul Bulk, Terjadwal, Daftar Batch, dan Antrean.
 * Menjaga urutan, label, dan gaya tombol tetap sama di semua halaman.
 */
export function BatchModuleActions({
  show,
  onRefresh,
  isRefreshing = false,
  children,
}: BatchModuleActionsProps) {
  return (
    <>
      {children}

      {onRefresh && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="gap-1.5 text-xs cursor-pointer"
        >
          <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>Segarkan</span>
        </Button>
      )}

      {show.includes("batches") && (
        <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs cursor-pointer">
          <Link href="/batches">
            <History className="size-3.5 text-muted-foreground" />
            <span>Daftar Batch</span>
          </Link>
        </Button>
      )}

      {show.includes("items") && (
        <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs cursor-pointer">
          <Link href="/queue/items">
            <ListChecks className="size-3.5 text-muted-foreground" />
            <span>Antrean</span>
          </Link>
        </Button>
      )}

      {show.includes("create") && (
        <Button size="sm" asChild className="gap-1.5 text-xs cursor-pointer font-semibold shadow-xs">
          <Link href="/queue">
            <Plus className="size-3.5" />
            <span>Tulis Massal</span>
          </Link>
        </Button>
      )}
    </>
  )
}
