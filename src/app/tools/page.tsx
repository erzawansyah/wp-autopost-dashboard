"use client"

import Link from "next/link"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import { Wrench, Link2, Users, FolderTree, ChevronRight, Sparkles, ExternalLink } from "lucide-react"

const WP_TOOLS = [
  {
    title: "Link Building",
    href: "/tools/link-building",
    icon: Link2,
    badge: "AI Internal Linking",
    description:
      "Mesin retroaktif internal linking cerdas. Cukup masukkan URL artikel baru, AI mencari artikel lama relevan di WordPress dan menyisipkan tautan dengan anchor natural secara otomatis.",
    features: [
      "AI ekstraksi topik & multi-query WP search",
      "Pencarian kalimat target & anchor natural",
      "Penyisipan instan langsung ke WordPress via REST API",
    ],
  },
  {
    title: "Author Creator",
    href: "/tools/authors",
    icon: Users,
    badge: "AI Persona E-E-A-T",
    description:
      "Rancang profil penulis baru berbasis AI dengan otoritas E-E-A-T nyata. AI membaca author & bio yang ada, menyusun persona baru, lalu Anda tinggal setujui atau tolak sebelum diterbitkan.",
    features: [
      "AI analisis author dan bio eksisting di WP",
      "Penyusunan bio kredibel standar Google E-E-A-T",
      "Alur persetujuan: Setujui & Buat di WP atau Tolak",
    ],
  },
  {
    title: "Kategori Creator",
    href: "/tools/categories",
    icon: FolderTree,
    badge: "AI Taksonomi Konten",
    description:
      "Rancang taksonomi kategori WordPress cerdas dengan AI. Cukup beri instruksi topik, AI menganalisis kategori yang ada dan merancang hierarki baru bebas tumpang tindih beserta deskripsi SEO.",
    features: [
      "AI pembaca struktur kategori WordPress",
      "Rekomendasi hierarki non-overlapping & deskripsi SEO",
      "Pilih & posting masal langsung ke database WP",
    ],
  },
]

export default function WpToolsPage() {
  return (
    <DashboardLayout>
      <PageContainer size="default">
        <PageHeader
          title="WP Tools"
          description="Koleksi alat bantu otomasi dan pengelolaan teknis website WordPress Anda."
          icon={Wrench}
        />

        <div className="grid gap-5 md:grid-cols-3">
          {WP_TOOLS.map((tool) => {
            const Icon = tool.icon
            return (
              <Card
                key={tool.href}
                className="flex flex-col justify-between border-border/80 bg-card/90 shadow-2xs transition-all hover:border-primary/50 hover:shadow-md"
              >
                <div>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </div>
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {tool.badge}
                      </Badge>
                    </div>
                    <CardTitle className="text-sm font-semibold pt-2 text-foreground">
                      {tool.title}
                    </CardTitle>
                    <CardDescription className="text-xs leading-relaxed line-clamp-3">
                      {tool.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1.5 border-t border-border/60 pt-3">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Fitur Utama:
                      </span>
                      <ul className="space-y-1 text-[11px] text-muted-foreground">
                        {tool.features.map((feature, idx) => (
                          <li key={idx} className="flex items-center gap-1.5">
                            <span className="size-1 rounded-full bg-primary/70 shrink-0" />
                            <span className="truncate">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </div>
                <div className="p-6 pt-0">
                  <Button asChild variant="default" size="sm" className="w-full cursor-pointer gap-1.5 text-xs">
                    <Link href={tool.href}>
                      <span>Buka {tool.title}</span>
                      <ChevronRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
