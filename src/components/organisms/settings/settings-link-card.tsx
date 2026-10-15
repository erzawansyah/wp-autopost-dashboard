import * as React from "react"
import Link from "next/link"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { cn } from "@/lib/utils"

interface SettingsLinkCardProps {
  href: string
  icon: LucideIcon
  title: string
  description: React.ReactNode
  /** Teks tombol tautan. */
  cta: string
  /** Badge ringkas di pojok kanan header. */
  badge?: React.ReactNode
  /** Kartu utama (tombol primer + border aksen). */
  featured?: boolean
  className?: string
}

/** Kartu navigasi ke sub-halaman pengaturan. Presentasional, dirender dari Server Component. */
export function SettingsLinkCard({ href, icon: Icon, title, description, cta, badge, featured, className }: SettingsLinkCardProps) {
  return (
    <Card
      className={cn(
        "gap-4 bg-card/90 shadow-2xs transition-shadow hover:shadow-md",
        featured ? "border-primary/40" : "border-border/80",
        className
      )}
    >
      <CardHeader>
        <CardTitle className={cn("flex items-center gap-2", featured ? "text-base" : "text-sm")}>
          <Icon aria-hidden="true" className={cn("text-primary", featured ? "size-5" : "size-4")} />
          {title}
        </CardTitle>
        {badge && <CardAction>{badge}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-start justify-between gap-4">
        <CardDescription className="max-w-3xl text-xs leading-relaxed">{description}</CardDescription>
        <Button asChild variant={featured ? "default" : "outline"} size="sm" className="gap-1.5 text-xs">
          <Link href={href}>
            {cta}
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
