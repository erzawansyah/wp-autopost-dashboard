import Link from "next/link"
import { ChevronRight, FolderTree, Link2, Users, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/atoms/card"

interface WpTool {
  title: string
  href: string
  icon: LucideIcon
  badge: string
  description: string
  features: readonly string[]
}

const WP_TOOLS: readonly WpTool[] = [
  {
    title: "Link Building",
    href: "/tools/link-building",
    icon: Link2,
    badge: "AI Internal Linking",
    description:
      "Mesin retroaktif internal linking cerdas. Cukup masukkan URL artikel baru, AI mencari artikel lama relevan di WordPress dan menyisipkan tautan dengan anchor natural.",
    features: [
      "AI ekstraksi topik & multi-query WP search",
      "Pencarian kalimat target & anchor natural",
      "Penyisipan ke WordPress via REST API setelah konfirmasi",
    ],
  },
  {
    title: "Author Creator",
    href: "/tools/authors",
    icon: Users,
    badge: "AI Persona E-E-A-T",
    description:
      "Rancang profil penulis baru berbasis AI dengan otoritas E-E-A-T nyata. AI membaca author & bio yang ada, menyusun persona baru, lalu Anda setujui atau tolak sebelum dibuat.",
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
      "Rancang taksonomi kategori WordPress cerdas dengan AI. Beri instruksi topik, AI menganalisis kategori yang ada dan merancang hierarki baru bebas tumpang tindih beserta deskripsi SEO.",
    features: [
      "AI pembaca struktur kategori WordPress",
      "Rekomendasi hierarki non-overlapping & deskripsi SEO",
      "Setujui per kategori atau sekaligus ke WordPress",
    ],
  },
]

/** Kartu navigasi WP Tools (Server Component). */
export function ToolHubGrid() {
  return (
    <ul className="grid gap-5 md:grid-cols-3">
      {WP_TOOLS.map(({ title, href, icon: Icon, badge, description, features }) => (
        <li key={href} className="flex">
          <Card className="flex-1 justify-between gap-4 border-border/80 py-5 shadow-2xs transition-colors hover:border-primary/50">
            <CardHeader className="gap-2 px-5">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-lg bg-primary/10 p-2.5 text-primary">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <Badge variant="outline" className="font-normal">
                  {badge}
                </Badge>
              </div>
              <CardTitle className="pt-2 text-sm">
                <h2>{title}</h2>
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
            </CardHeader>

            <CardContent className="px-5">
              <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
                <h3 className="text-2xs font-medium tracking-wider text-muted-foreground uppercase">Fitur utama</h3>
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5">
                      <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/70" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>

            <CardFooter className="px-5">
              <Button asChild size="sm" className="w-full text-xs">
                <Link href={href}>
                  Buka {title}
                  <ChevronRight aria-hidden="true" data-icon="inline-end" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  )
}
