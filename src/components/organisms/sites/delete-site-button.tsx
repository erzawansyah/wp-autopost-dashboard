"use client"

import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/atoms/button"
import type { Site } from "@/types/site"
import { useDeleteSite } from "./use-delete-site"

/** Tombol hapus situs di halaman detail; setelah terhapus kembali ke `/sites`. */
export function DeleteSiteButton({ site }: { site: Pick<Site, "id" | "site_name"> }) {
  const router = useRouter()
  const { requestDelete, pendingId } = useDeleteSite({ onDeleted: () => router.replace("/sites") })
  const isDeleting = pendingId === site.id

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      onClick={() => void requestDelete(site)}
      disabled={isDeleting}
      className="cursor-pointer gap-1.5"
    >
      {isDeleting ? (
        <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      ) : (
        <Trash2 aria-hidden="true" />
      )}
      {isDeleting ? "Menghapus…" : "Hapus Website"}
    </Button>
  )
}
