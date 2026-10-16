"use client"

import { KeyRound, Loader2 } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { notify } from "@/lib/ui/notify"
import type { Site } from "@/types/site"
import { useStartSiteConnection } from "./use-start-site-connection"

/**
 * "Sambungkan ulang": alur otorisasi otomatis untuk alamat situs yang sama. WordPress membuat Application Password
 * baru dan callback meng-upsert kredensial pada baris situs ini (antrean & pengaturan tetap), status → `connected`.
 */
export function ReconnectSiteButton({ site }: { site: Pick<Site, "base_url" | "site_name"> }) {
  const reconnect = useStartSiteConnection({
    onError: (error) => notify.error(error, { fallback: "Gagal menyiapkan otorisasi WordPress. Coba lagi." }),
  })
  const isBusy = reconnect.isPending || reconnect.isSuccess

  return (
    <Button
      type="button"
      size="sm"
      onClick={() =>
        reconnect.mutate(
          { baseUrl: site.base_url, siteName: site.site_name },
          { onSuccess: (target) => window.location.assign(target) }
        )
      }
      disabled={isBusy}
      className="cursor-pointer gap-1.5"
    >
      {isBusy ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <KeyRound aria-hidden="true" />}
      {reconnect.isSuccess ? "Mengalihkan ke WordPress…" : reconnect.isPending ? "Memeriksa website…" : "Sambungkan ulang"}
    </Button>
  )
}
