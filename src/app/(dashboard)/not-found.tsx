import Link from "next/link"
import { FileQuestion, Home, PenLine } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { EmptyState } from "@/components/molecules/empty-state"
import { PageContainer } from "@/components/templates/page-container"

/** Dirender di dalam shell saat page dasbor memanggil `notFound()` (mis. artikel/agen milik orang lain). */
export default function DashboardNotFound() {
  return (
    <PageContainer>
      <EmptyState
        icon={FileQuestion}
        title="Data atau halaman tidak ditemukan"
        description="Alamat yang Anda tuju mungkin salah ketik, sudah dihapus, atau bukan milik akun Anda."
      >
        <Button asChild size="sm" className="cursor-pointer gap-2">
          <Link href="/">
            <Home aria-hidden="true" />
            Ke Dashboard
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="cursor-pointer gap-2">
          <Link href="/posts/new">
            <PenLine aria-hidden="true" />
            Tulis Artikel
          </Link>
        </Button>
      </EmptyState>
    </PageContainer>
  )
}
