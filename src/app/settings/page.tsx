"use client"

import Link from "next/link"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Bot, ChevronRight, Search, Settings, SlidersHorizontal, UserRound } from "lucide-react"

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <PageContainer size="default">
        <PageHeader
          title="Pengaturan"
          description="Kelola koneksi AI, preferensi akun, dan konfigurasi ruang kerja dari satu tempat."
          icon={Settings}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/80 bg-card/90 shadow-2xs transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bot className="size-4 text-ai-process" />
                Provider AI &amp; API Key
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Atur OpenRouter API key dan model default untuk menghasilkan artikel dengan konfigurasi Anda sendiri.
              </p>
              <Button asChild variant="outline" size="sm" className="w-fit cursor-pointer gap-1.5 text-xs">
                <Link href="/settings/ai">
                  Buka pengaturan AI
                  <ChevronRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/90 shadow-2xs transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Search className="size-4 text-primary" />
                Mesin Pencari &amp; Riset Web (BYOK)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Atur kunci API Tavily dan Brave Search untuk riset topik aktual, bebas halusinasi, dan kuota gratis resmi.
              </p>
              <Button asChild variant="outline" size="sm" className="w-fit cursor-pointer gap-1.5 text-xs">
                <Link href="/settings/search">
                  Buka pengaturan mesin pencari
                  <ChevronRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/90 shadow-2xs transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Settings className="size-4 text-primary" />
                Integrasi Webhook &amp; Automasi
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Kirim payload notifikasi HTTP POST otomatis ke Zapier, Make, n8n, Slack, Discord, atau server Anda.
              </p>
              <Button asChild variant="outline" size="sm" className="w-fit cursor-pointer gap-1.5 text-xs">
                <Link href="/settings/webhooks">
                  Kelola webhook
                  <ChevronRight className="size-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/90 shadow-2xs transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserRound className="size-4 text-primary" />
                Profil &amp; Preferensi Akun
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Kelola identitas tenant, preferensi notifikasi kegagalan posting, dan kunci BYOK media tambahan.
              </p>
              <Button asChild variant="outline" size="sm" className="w-fit cursor-pointer gap-1.5 text-xs">
                <Link href="/settings/profile">
                  Buka profil &amp; preferensi
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
