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

          <Card className="border-border/80 bg-card/90 opacity-75 shadow-2xs">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserRound className="size-4 text-primary" />
                Profil &amp; preferensi
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Preferensi akun, notifikasi, webhook, dan keamanan ruang kerja akan tersedia di tahap berikutnya.
              </p>
              <span className="flex w-fit items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <SlidersHorizontal className="size-3" /> Segera hadir
              </span>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
