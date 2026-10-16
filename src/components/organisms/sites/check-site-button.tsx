"use client"

import { useRouter } from "next/navigation"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { useCheckSite } from "./use-check-site"

/** Tombol "Cek ulang koneksi" di halaman detail situs; hasilnya menyegarkan badge & kartu koneksi (RSC). */
export function CheckSiteButton({ siteId }: { siteId: string }) {
  const router = useRouter()
  const { checkSite, pendingId } = useCheckSite({ onChecked: () => router.refresh() })
  const isChecking = pendingId === siteId

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => checkSite(siteId)}
      disabled={isChecking}
      className="cursor-pointer gap-1.5"
    >
      {isChecking ? (
        <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
      {isChecking ? "Mengecek koneksi…" : "Cek ulang koneksi"}
    </Button>
  )
}
