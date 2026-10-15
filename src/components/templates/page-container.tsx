import * as React from "react"
import { cn } from "@/lib/utils"

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  /**
   * Pilihan lebar container:
   * - "default": max-w-7xl (Standar seragam seluruh halaman menu dashboard)
   * - "full": w-full (Tanpa batasan max-width, untuk tabel sangat lebar)
   * - "narrow": max-w-4xl (Untuk formulir panjang atau halaman teks terfokus)
   */
  size?: "default" | "full" | "narrow"
  /** ClassName tambahan untuk penyesuaian spesifik */
  className?: string
}

/**
 * Komponen Standar Pembungkus Konten Halaman (Template Layout)
 * Menjamin lebar container dan padding selalu seragam dan konsisten di seluruh aplikasi.
 * Tanpa "use client": dapat dirender langsung oleh page Server Component maupun Client Component.
 */
export function PageContainer({
  children,
  size = "default",
  className,
  ...props
}: PageContainerProps) {
  const sizeClasses = {
    default: "max-w-7xl",
    full: "w-full",
    narrow: "max-w-4xl",
  }

  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 pb-16",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
