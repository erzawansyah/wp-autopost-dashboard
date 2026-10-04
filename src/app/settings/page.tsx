"use client"

import Link from "next/link"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { KeyRound, ChevronRight, Settings, UserRound, Sparkles } from "lucide-react"

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <PageContainer size="default">
        <PageHeader
          title="Pengaturan"
          description="Kelola koneksi AI, preferensi akun, integrasi kunci API, dan automasi dari satu tempat."
          icon={Settings}
        />

        <div className="grid gap-4 md:grid-cols-2">
          {/* Main Featured: Unified API Keys & BYOK Hub */}
          <Card className="border-primary/40 bg-card/90 shadow-2xs transition-shadow hover:shadow-md md:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <KeyRound className="size-5 text-primary" />
                  Pusat Kunci API &amp; Integrasi (BYOK Hub)
                </CardTitle>
                <span className="flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  <Sparkles className="size-3" />
                  Terpusat
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs leading-relaxed text-muted-foreground max-w-3xl">
                Kelola seluruh kunci API pihak ketiga Anda secara terpadu: <strong>OpenRouter AI</strong> (model &amp; penulisan), <strong>Mesin Pencari Web</strong> (Tavily, Brave, URL SearxNG mandiri), dan <strong>Pencarian Foto</strong> (API Key Pexafy &amp; SearxNG Images). Semua kunci dienkripsi server dengan AES-256-GCM.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild variant="default" size="sm" className="w-fit cursor-pointer gap-1.5 text-xs px-4">
                  <Link href="/settings/keys">
                    Kelola Semua Kunci API
                    <ChevronRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Profil & Preferensi */}
          <Card className="border-border/80 bg-card/90 shadow-2xs transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserRound className="size-4 text-primary" />
                Profil &amp; Preferensi Akun
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Kelola identitas tenant multi-user, status Row Level Security (RLS) database, dan preferensi notifikasi kegagalan posting.
              </p>
              <Button asChild variant="outline" size="sm" className="w-fit cursor-pointer gap-1.5 text-xs">
                <Link href="/settings/profile">
                  Buka profil &amp; preferensi
                  <ChevronRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Integrasi Webhook */}
          <Card className="border-border/80 bg-card/90 shadow-2xs transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Settings className="size-4 text-primary" />
                Integrasi Webhook &amp; Automasi
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Kirim payload notifikasi HTTP POST otomatis ke Zapier, Make, n8n, Slack, Discord, atau server automasi Anda saat posting selesai.
              </p>
              <Button asChild variant="outline" size="sm" className="w-fit cursor-pointer gap-1.5 text-xs">
                <Link href="/settings/webhooks">
                  Kelola webhook
                  <ChevronRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
