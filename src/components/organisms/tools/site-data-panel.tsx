"use client"

import * as React from "react"
import type { UseQueryResult } from "@tanstack/react-query"
import { AlertCircle, RefreshCw, type LucideIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { Skeleton } from "@/components/atoms/skeleton"
import { EmptyState } from "@/components/molecules/empty-state"
import { SearchInput } from "@/components/molecules/search-input"
import { errorMessage } from "@/lib/ui/notify"
import { cn } from "@/lib/utils"

interface SiteDataPanelProps<TItem> {
  title: string
  description: string
  icon: LucideIcon
  /** Hasil `useQuery(sitesQueries.categories|authors(siteId))`. */
  query: Pick<UseQueryResult<TItem[]>, "data" | "isPending" | "isFetching" | "error" | "refetch">
  /** Kata benda untuk jumlah & pesan (mis. "kategori"). */
  noun: string
  searchPlaceholder: string
  matches: (item: TItem, query: string) => boolean
  emptyTitle: string
  emptyDescription: string
  /** Render baris `<li>` untuk item yang lolos pencarian. */
  children: (items: TItem[]) => React.ReactNode
}

/**
 * Panel data live dari WordPress situs aktif (kategori / author): jumlah, muat ulang, pencarian lokal,
 * serta state loading, galat (Coba lagi), dan kosong.
 */
export function SiteDataPanel<TItem>({
  title,
  description,
  icon: Icon,
  query,
  noun,
  searchPlaceholder,
  matches,
  emptyTitle,
  emptyDescription,
  children,
}: SiteDataPanelProps<TItem>) {
  const [search, setSearch] = React.useState("")
  const items = React.useMemo(() => query.data ?? [], [query.data])
  const filtered = React.useMemo(() => items.filter((item) => matches(item, search)), [items, matches, search])

  return (
    <Card className="gap-0 overflow-hidden border-border/80 py-0 shadow-2xs">
      <CardHeader className="border-b border-border/60 px-5 py-4 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <Icon aria-hidden="true" className="size-4 text-primary" />
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
        <CardAction className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono">
            {items.length} {noun}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label={`Muat ulang ${noun} dari WordPress`}
            className="cursor-pointer"
          >
            <RefreshCw aria-hidden="true" className={cn(query.isFetching && "animate-spin motion-reduce:animate-none")} />
          </Button>
        </CardAction>
      </CardHeader>

      <div className="border-b border-border/60 bg-muted/20 p-2.5">
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch("")}
          placeholder={searchPlaceholder}
          aria-label={`Cari ${noun}`}
        />
      </div>

      <CardContent className="p-0">
        {query.isPending ? (
          <div className="flex flex-col gap-3 p-4">
            <span role="status" className="sr-only">
              Mengambil {noun} dari WordPress…
            </span>
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} aria-hidden="true" className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : query.error ? (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Gagal memuat {noun}</AlertTitle>
              <AlertDescription>
                <p>{errorMessage(query.error, `Terjadi gangguan saat mengambil ${noun} dari WordPress.`)}</p>
                <Button type="button" variant="outline" size="xs" onClick={() => void query.refetch()} className="mt-1 cursor-pointer">
                  <RefreshCw aria-hidden="true" data-icon="inline-start" />
                  Coba lagi
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Icon} title={emptyTitle} description={emptyDescription} className="rounded-none border-0 bg-transparent" />
        ) : filtered.length === 0 ? (
          <p role="status" className="px-4 py-12 text-center text-xs text-muted-foreground">
            Tidak ada {noun} yang cocok dengan &ldquo;{search.trim()}&rdquo;.
          </p>
        ) : (
          <ul
            tabIndex={0}
            aria-label={`Daftar ${noun}`}
            className="max-h-128 divide-y divide-border/60 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {children(filtered)}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
