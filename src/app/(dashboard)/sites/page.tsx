import { AlertCircle, AlertTriangle, CheckCircle2, Globe } from "lucide-react"
import { DismissibleAlert } from "@/components/molecules/dismissible-alert"
import { PageHeader } from "@/components/molecules/page-header"
import { ConnectSiteDialog } from "@/components/organisms/sites/connect-site-dialog"
import { CONNECT_STATUS_PARAMS, describeConnectStatus } from "@/components/organisms/sites/connect-status"
import { SitesTable } from "@/components/organisms/sites/sites-table"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { firstParam, type SearchParamValue } from "@/lib/search-params"
import { accountAppIdentifier, listSites } from "@/server/services/sites"

export const metadata = { title: "Daftar Website" }

type SearchParams = Promise<Record<string, SearchParamValue>>

const NOTICE_ICONS = {
  success: <CheckCircle2 aria-hidden="true" />,
  warning: <AlertTriangle aria-hidden="true" />,
  destructive: <AlertCircle aria-hidden="true" />,
}

export default async function SitesPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ supabase, user }, params] = await Promise.all([requireSession(), searchParams])
  const sites = await listSites(supabase, user.id)

  // Hasil redirect alur otorisasi WordPress (`/api/sites/callback` → `?auth_status=…`).
  const notice = describeConnectStatus({
    authStatus: firstParam(params.auth_status),
    siteName: firstParam(params.site_name),
    error: firstParam(params.error),
  })
  const accountIdentifier = accountAppIdentifier(user)

  return (
    <PageContainer>
      <PageHeader
        title="Daftar Website WordPress"
        description="Sambungkan website WordPress Anda tanpa memasang plugin tambahan, lalu atur batas kirim tiap website."
        icon={Globe}
        actions={<ConnectSiteDialog accountIdentifier={accountIdentifier} />}
      />

      {notice && (
        <DismissibleAlert
          key={notice.status}
          variant={notice.variant}
          icon={NOTICE_ICONS[notice.variant]}
          title={notice.title}
          clearSearchParams={CONNECT_STATUS_PARAMS}
        >
          {notice.description}
        </DismissibleAlert>
      )}

      <SitesTable
        initialSites={sites}
        emptyAction={<ConnectSiteDialog accountIdentifier={accountIdentifier} triggerLabel="Sambungkan Website Pertama" />}
      />
    </PageContainer>
  )
}
