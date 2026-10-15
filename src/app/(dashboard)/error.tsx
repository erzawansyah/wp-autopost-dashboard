"use client"

import { PageContainer } from "@/components/templates/page-container"
import { RouteErrorState } from "@/components/organisms/route-error-state"

/** Error boundary halaman dasbor: shell (sidebar/navbar) tetap tampil, hanya isi halaman yang diganti. */
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <PageContainer>
      <RouteErrorState error={error} retry={retry} />
    </PageContainer>
  )
}
