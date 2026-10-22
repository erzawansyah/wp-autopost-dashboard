import Link from "next/link"
import { Bot, Layers, ListChecks, PenLine, Sprout, TableProperties, Wrench, type LucideIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card"

interface QuickLink {
  href: string
  title: string
  description: string
  icon: LucideIcon
}

/** Rute & ikon sama dengan `SidebarNav`. */
const QUICK_LINKS: QuickLink[] = [
  { href: "/posts/new", title: "Tulis Cepat", description: "Satu artikel dari satu kata kunci.", icon: PenLine },
  { href: "/queue", title: "Tulis Massal", description: "Banyak kata kunci sekaligus, terjadwal.", icon: Layers },
  { href: "/write/niche", title: "Tulis Niche", description: "Satu niche, kata kunci disusun AI.", icon: Sprout },
  { href: "/write/structured", title: "Tulis Terstruktur", description: "Impor CSV dengan kolom lengkap.", icon: TableProperties },
  { href: "/queue/items", title: "Antrean", description: "Pantau, kirim ulang, atau hapus item.", icon: ListChecks },
  { href: "/tools", title: "WP Tools", description: "Kategori, author, dan tautan internal.", icon: Wrench },
  { href: "/agents", title: "Profil Agen", description: "Atur gaya & model penulisan AI.", icon: Bot },
]

/** Pintasan alur kerja utama (Server Component). */
export function QuickLinks() {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-sm">Mulai Bekerja</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {QUICK_LINKS.map(({ href, title, description, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex h-full items-start gap-3 rounded-lg border border-border/80 p-3 transition-colors duration-150 hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{title}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
