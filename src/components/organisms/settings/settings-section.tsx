import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { cn } from "@/lib/utils"

interface SettingsSectionProps {
  /** Anchor (`/settings/keys#model-ai`). */
  id?: string
  icon: LucideIcon
  /** Warna ikon judul (token peran), default `text-primary`. */
  iconClassName?: string
  title: string
  description: React.ReactNode
  /** Status ringkas / tautan di pojok kanan header. */
  action?: React.ReactNode
  children: React.ReactNode
}

/** Kartu satu bagian halaman pengaturan: judul + deskripsi + aksi header, lalu isi form. Aman dari Server Component. */
export function SettingsSection({ id, icon: Icon, iconClassName, title, description, action, children }: SettingsSectionProps) {
  return (
    <Card id={id} className="scroll-mt-20 gap-0 border-border/80 py-0 shadow-2xs">
      <CardHeader className="border-b border-border/60 py-4 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon aria-hidden="true" className={cn("size-4 shrink-0 text-primary", iconClassName)} />
          {title}
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
        {action && <CardAction className="flex items-center gap-1.5">{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 py-4">{children}</CardContent>
    </Card>
  )
}
