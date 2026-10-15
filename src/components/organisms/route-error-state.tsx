"use client"

import * as React from "react"
import Link from "next/link"
import { AlertTriangle, Home, RotateCcw } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { EmptyState } from "@/components/molecules/empty-state"

interface RouteErrorStateProps {
  error: Error & { digest?: string }
  retry: () => void
  /** Tautan keluar dari halaman yang gagal; default dasbor. */
  homeHref?: string
  homeLabel?: string
}

/**
 * Isi standar `error.tsx` segmen. Tidak pernah menampilkan `error.message`/stack (bisa berisi detail
 * internal); hanya `digest` sebagai kode referensi log server.
 */
export function RouteErrorState({ error, retry, homeHref = "/", homeLabel = "Ke Dashboard" }: RouteErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col gap-3">
      <EmptyState
        variant="destructive"
        icon={AlertTriangle}
        title="Halaman gagal dimuat"
        description="Terjadi kesalahan tak terduga saat menampilkan halaman ini. Coba muat ulang; bila masalah berlanjut, hubungi admin dan sertakan kode referensi di bawah."
      >
        <Button size="sm" onClick={retry} className="cursor-pointer gap-2">
          <RotateCcw aria-hidden="true" />
          Coba lagi
        </Button>
        <Button asChild size="sm" variant="outline" className="cursor-pointer gap-2">
          <Link href={homeHref}>
            <Home aria-hidden="true" />
            {homeLabel}
          </Link>
        </Button>
      </EmptyState>
      {error.digest && (
        <p className="text-center font-mono text-xs text-muted-foreground">Kode referensi: {error.digest}</p>
      )}
    </div>
  )
}
