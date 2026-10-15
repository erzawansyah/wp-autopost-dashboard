"use client"

import * as React from "react"
import Link from "next/link"
import { CheckCircle2, Terminal } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { DismissibleAlert } from "@/components/molecules/dismissible-alert"
import { nextQueuedPostNotice, type QueuedPostPayload } from "./queued-post-notice-state"

/** Parameter redirect Tulis Cepat (`/?queued=true&postId=…&keyword=…`), dibersihkan setelah banner tampil. */
const QUEUED_PARAMS = ["queued", "postId", "keyword"] as const

/**
 * Banner "Artikel masuk antrean" setelah Tulis Cepat. Payload dari `searchParams` RSC hanya menjadi nilai awal:
 * render ulang tanpa parameter (URL dibersihkan, `router.refresh()`) tidak menghilangkan banner sampai ditutup.
 */
export function QueuedPostNotice({ queued }: { queued: QueuedPostPayload | null }) {
  const [notice, setNotice] = React.useState(() => nextQueuedPostNotice(null, queued))
  // Penyesuaian state saat props berubah (pola "informasi dari render sebelumnya"): hanya payload baru yang menimpa.
  const next = nextQueuedPostNotice(notice, queued)
  if (next !== notice) setNotice(next)

  if (!next) return null

  return (
    <DismissibleAlert
      key={next.key}
      variant="success"
      icon={<CheckCircle2 aria-hidden="true" />}
      title="Artikel masuk antrean"
      clearSearchParams={QUEUED_PARAMS}
    >
      <p>
        {next.keyword ? `Topik "${next.keyword}" sedang` : "Naskah sedang"} ditulis AI lalu dikirim otomatis ke
        WordPress. Status di tabel bawah diperbarui sendiri.
      </p>
      {next.postId && (
        <Button asChild size="xs" variant="outline" className="cursor-pointer gap-1">
          <Link href={`/posts/${next.postId}`}>
            <Terminal aria-hidden="true" />
            Pantau log eksekusi
          </Link>
        </Button>
      )}
    </DismissibleAlert>
  )
}
