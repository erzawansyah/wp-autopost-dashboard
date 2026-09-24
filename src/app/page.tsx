import * as React from "react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { EmptyState } from "@/components/molecules/empty-state"
import { Layers } from "lucide-react"

export default function HomePage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            WP Autopost & Multi-Site Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Platform otomatisasi konten multi-situs WordPress siap dihubungkan ke skema database Supabase.
          </p>
        </div>

        <EmptyState
          icon={Layers}
          title="Belum Ada Data Antrean"
          description="Dashboard siap menerima data live dari database Supabase dan integrasi WordPress REST API."
          actionLabel="+ Quick Single Post"
        />
      </div>
    </DashboardLayout>
  )
}
