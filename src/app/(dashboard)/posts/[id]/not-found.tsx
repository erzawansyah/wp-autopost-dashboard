import Link from "next/link"
import { FileX } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { EmptyState } from "@/components/molecules/empty-state"
import { PageContainer } from "@/components/templates/page-container"

/** Artikel tidak ada atau bukan milik pengguna (RLS → 404, bukan 403). */
export default function PostNotFound() {
  return (
    <PageContainer>
      <EmptyState
        icon={FileX}
        title="Artikel tidak ditemukan"
        description="Artikel dengan ID tersebut tidak tersedia atau Anda tidak memiliki akses."
      >
        <Button asChild size="sm" variant="outline">
          <Link href="/queue/items">Buka Antrean</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/">Kembali ke Dashboard</Link>
        </Button>
      </EmptyState>
    </PageContainer>
  )
}
