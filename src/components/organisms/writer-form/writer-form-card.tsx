"use client"

import * as React from "react"
import { SlidersHorizontal, Sparkles, type LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"

export type WriterFormTab = "essential" | "advanced"

interface WriterFormCardProps {
  title: string
  description: string
  icon: LucideIcon
  /** Label tab utama (default "Wajib"). */
  essentialLabel?: string
  /** Jumlah opsi lanjutan yang diisi (badge di tab "Lanjutan"). */
  advancedCount: number
  tab: WriterFormTab
  onTabChange: (tab: WriterFormTab) => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  /** Callout di atas field (hasil kirim, galat). */
  banner?: React.ReactNode
  essential: React.ReactNode
  advanced: React.ReactNode
  footer: React.ReactNode
}

/**
 * Kerangka form penulis (Tulis Cepat / Tulis Massal / Tulis Terstruktur): kartu dengan tab "Wajib" vs
 * "Lanjutan" (badge jumlah opsi lanjutan terisi), satu `<form noValidate>`, dan footer aksi.
 * Field tab yang tidak aktif tetap tersimpan di react-hook-form (tidak di-unregister).
 */
export function WriterFormCard({
  title,
  description,
  icon: Icon,
  essentialLabel = "Wajib",
  advancedCount,
  tab,
  onTabChange,
  onSubmit,
  banner,
  essential,
  advanced,
  footer,
}: WriterFormCardProps) {
  return (
    <Tabs value={tab} onValueChange={(value) => onTabChange(value as WriterFormTab)}>
      <Card className="border-border/80 shadow-2xs">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Icon aria-hidden="true" className="size-4 text-primary" />
                {title}
              </CardTitle>
              <CardDescription className="mt-0.5 text-xs">{description}</CardDescription>
            </div>
            <TabsList className="grid h-9 w-full grid-cols-2 sm:w-auto">
              <TabsTrigger value="essential" className="gap-1.5 text-xs">
                <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
                {essentialLabel}
              </TabsTrigger>
              <TabsTrigger value="advanced" className="gap-1.5 text-xs">
                <SlidersHorizontal aria-hidden="true" className="size-3.5 text-muted-foreground" />
                Lanjutan
                {advancedCount > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-primary font-mono text-2xs font-bold text-primary-foreground">
                    {advancedCount}
                    <span className="sr-only"> opsi diisi</span>
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
            {banner}
            <TabsContent value="essential" className="mt-0 flex flex-col gap-6">
              {essential}
            </TabsContent>
            <TabsContent value="advanced" className="mt-0 flex flex-col gap-5">
              {advanced}
            </TabsContent>
            <div className="flex flex-col items-stretch justify-between gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center">
              {footer}
            </div>
          </form>
        </CardContent>
      </Card>
    </Tabs>
  )
}
