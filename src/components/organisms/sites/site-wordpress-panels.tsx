"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, FolderTree, RefreshCw, UserRound, type LucideIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { Skeleton } from "@/components/atoms/skeleton"
import { sitesQueries } from "@/lib/api/queries/sites"
import { errorMessage } from "@/lib/ui/notify"
import { cn } from "@/lib/utils"
import { orderCategoryTree } from "./site-helpers"

interface PanelQueryState {
  isPending: boolean
  isFetching: boolean
  error: Error | null
  refetch: () => unknown
}

interface WordPressPanelProps {
  title: string
  description: string
  icon: LucideIcon
  count?: number
  manageHref: string
  manageLabel: string
  emptyText: string
  query: PanelQueryState
  children: React.ReactNode
}

/** Kerangka panel data yang dibaca langsung dari WordPress (loading/error/kosong + tautan kelola). */
function WordPressPanel({
  title,
  description,
  icon: Icon,
  count,
  manageHref,
  manageLabel,
  emptyText,
  query,
  children,
}: WordPressPanelProps) {
  let body: React.ReactNode
  if (query.isPending) {
    body = (
      <div role="status" aria-label={`Memuat ${title.toLowerCase()}…`} className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-9 w-full" />
        ))}
      </div>
    )
  } else if (query.error && count === undefined) {
    body = (
      <Alert variant="destructive">
        <AlertTitle>Gagal memuat dari WordPress</AlertTitle>
        <AlertDescription>
          {errorMessage(query.error, "WordPress tidak merespons.")}
          <Button variant="outline" size="xs" onClick={() => query.refetch()} className="cursor-pointer">
            Coba lagi
          </Button>
        </AlertDescription>
      </Alert>
    )
  } else if (!count) {
    body = <p className="text-xs text-muted-foreground">{emptyText}</p>
  } else {
    body = children
  }

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon aria-hidden="true" className="size-4 text-primary" />
          {title}
          {count !== undefined && (
            <Badge variant="secondary" className="font-mono">
              {count}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            aria-label={`Muat ulang ${title.toLowerCase()} dari WordPress`}
            className="cursor-pointer text-muted-foreground"
          >
            <RefreshCw aria-hidden="true" className={query.isFetching ? "animate-spin motion-reduce:animate-none" : undefined} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {body}
        <Button asChild variant="link" size="sm" className="h-auto w-fit gap-1 p-0 text-xs">
          <Link href={manageHref}>
            {manageLabel}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/** Indentasi sub-kategori per kedalaman (dibatasi agar baris tetap terbaca di layar sempit). */
const DEPTH_INDENT = ["", "ml-3", "ml-6", "ml-9", "ml-12"] as const

/** Kategori WordPress situs (read-only; pembuatan & saran AI ada di WP Tools › Kategori). */
export function SiteCategoriesPanel({ siteId }: { siteId: string }) {
  const query = useQuery(sitesQueries.categories(siteId))
  const ordered = React.useMemo(() => orderCategoryTree(query.data ?? []), [query.data])

  return (
    <WordPressPanel
      title="Kategori WordPress"
      description="Dibaca langsung dari website (maks. 100 kategori)."
      icon={FolderTree}
      count={query.data?.length}
      manageHref="/tools/categories"
      manageLabel="Kelola & sarankan kategori di WP Tools"
      emptyText="Belum ada kategori di website ini."
      query={query}
    >
      <ul aria-label="Daftar kategori" className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-md border">
        {ordered.map(({ category, depth }) => (
          <li key={category.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className={cn("flex min-w-0 flex-col", depth > 0 && "border-l pl-3", DEPTH_INDENT[Math.min(depth, DEPTH_INDENT.length - 1)])}>
              <span className="truncate text-sm font-medium text-foreground">{category.name}</span>
              <span className="truncate font-mono text-xs text-muted-foreground">{category.slug}</span>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{category.count} artikel</span>
          </li>
        ))}
      </ul>
    </WordPressPanel>
  )
}

/** User/author WordPress situs (read-only; pembuatan persona ada di WP Tools › Author). */
export function SiteAuthorsPanel({ siteId }: { siteId: string }) {
  const query = useQuery(sitesQueries.authors(siteId))

  return (
    <WordPressPanel
      title="Author WordPress"
      description="Akun penulis yang terlihat oleh Application Password ini."
      icon={UserRound}
      count={query.data?.length}
      manageHref="/tools/authors"
      manageLabel="Tambah persona author di WP Tools"
      emptyText="WordPress tidak mengembalikan author untuk akun ini."
      query={query}
    >
      <ul aria-label="Daftar author" className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-md border">
        {query.data?.map((author) => (
          <li key={author.id} className="flex flex-col gap-0.5 px-3 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-foreground">{author.name || author.slug}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">@{author.slug}</span>
            </div>
            {author.description && <p className="line-clamp-2 text-xs text-muted-foreground">{author.description}</p>}
          </li>
        ))}
      </ul>
    </WordPressPanel>
  )
}
