import { KeyRound, Settings, Sparkles, UserRound, Webhook } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { PageHeader } from "@/components/molecules/page-header"
import { SettingsLinkCard } from "@/components/organisms/settings/settings-link-card"
import { PageContainer } from "@/components/templates/page-container"

export const metadata = { title: "Pengaturan" }

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Pengaturan"
        description="Kelola koneksi AI, preferensi akun, integrasi kunci API, dan automasi dari satu tempat."
        icon={Settings}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SettingsLinkCard
          featured
          className="md:col-span-2"
          href="/settings/keys"
          icon={KeyRound}
          title="Pusat Kunci API & Model AI (BYOK Hub)"
          badge={
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              <Sparkles aria-hidden="true" />
              Terpusat
            </Badge>
          }
          description={
            <>
              Kelola seluruh kunci API pihak ketiga secara terpadu: <strong>OpenRouter AI</strong> beserta model default &amp;
              tingkat penalaran, <strong>Mesin Pencari Web</strong> (Tavily, Brave, SerpAPI), <strong>Pencarian Foto</strong> (Pexafy),
              dan tracing <strong>LangSmith</strong>. Semua kunci dienkripsi server dengan AES-256-GCM.
            </>
          }
          cta="Kelola Kunci API & Model"
        />
        <SettingsLinkCard
          href="/settings/profile"
          icon={UserRound}
          title="Profil & Preferensi Akun"
          description="Identitas tenant, ganti kata sandi akun, status Row Level Security (RLS), dan Developer Mode."
          cta="Buka profil & preferensi"
        />
        <SettingsLinkCard
          href="/settings/webhooks"
          icon={Webhook}
          title="Integrasi Webhook & Automasi"
          description="Kirim payload HTTP POST otomatis ke Zapier, Make, n8n, Slack, Discord, atau server automasi Anda saat artikel atau batch selesai maupun gagal."
          cta="Kelola webhook"
        />
      </div>
    </PageContainer>
  )
}
