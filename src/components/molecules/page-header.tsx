"use client"

import * as React from "react"
import Link from "next/link"
import { LucideIcon, ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/atoms/button"

export interface PageHeaderProps {
  /** Judul utama halaman */
  title: React.ReactNode
  /** Deskripsi penjelasan singkat di bawah judul */
  description?: React.ReactNode
  /** Ikon representasi modul/fitur halaman */
  icon?: LucideIcon
  /** Badge status atau indikator ekstra di samping judul */
  badge?: React.ReactNode
  /** Tombol aksi utama atau filter yang diletakkan di sisi kanan atas */
  actions?: React.ReactNode
  /** URL untuk tombol kembali jika halaman merupakan sub-halaman */
  backHref?: string
  /** Label khusus untuk tombol kembali */
  backLabel?: string
  /** ClassName kustom untuk container header */
  className?: string
}

/**
 * Komponen Standar Header Halaman (Atomic Molecule)
 * Memastikan hierarki visual judul, deskripsi, ikon, dan tombol aksi selalu konsisten
 * di seluruh modul aplikasi sesuai pedoman DESIGN.md.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  badge,
  actions,
  backHref,
  backLabel = "Kembali",
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        {backHref && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="-ml-2 h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Link href={backHref}>
                <ChevronLeft className="size-3.5" />
                <span>{backLabel}</span>
              </Link>
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          {Icon && (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
              <Icon className="size-4 text-accent" />
            </div>
          )}
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl truncate">
            {title}
          </h1>
          {badge && <div className="flex items-center">{badge}</div>}
        </div>

        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed sm:text-sm max-w-3xl">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 pt-2 sm:pt-0">
          {actions}
        </div>
      )}
    </div>
  )
}
