import Link from "next/link"
import { FlaskConical, Home, UserCog } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { EmptyState } from "@/components/molecules/empty-state"
import { PageHeader } from "@/components/molecules/page-header"
import { PageContainer } from "@/components/templates/page-container"

/** Halaman ramah untuk pengguna tanpa Developer Mode (dirender layout `/lab` di server, bukan disembunyikan di client). */
export function LabAccessDenied() {
  return (
    <PageContainer>
      <PageHeader
        title="Laboratorium & Test Bench"
        description="Lingkungan uji tool dan Agent Profile khusus Developer Mode."
        icon={FlaskConical}
      />
      <EmptyState
        icon={FlaskConical}
        title="Laboratorium memerlukan Developer Mode"
        description="Aktifkan Developer Mode di Pengaturan Profil untuk menguji tools dan Agent Profile secara langsung. Uji Agent Profile memakai kunci BYOK Anda dan dapat menimbulkan biaya token."
      >
        <Button asChild size="sm">
          <Link href="/settings/profile">
            <UserCog aria-hidden="true" />
            Buka Pengaturan Profil
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/">
            <Home aria-hidden="true" />
            Ke Dashboard
          </Link>
        </Button>
      </EmptyState>
    </PageContainer>
  )
}
