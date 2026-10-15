"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronsUpDown, Loader2, RefreshCw, Search, X } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Checkbox } from "@/components/atoms/checkbox"
import { Input } from "@/components/atoms/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover"
import { sitesQueries } from "@/lib/api/queries/sites"
import { errorMessage } from "@/lib/ui/notify"
import { cn } from "@/lib/utils"
import type { SiteCategory } from "@/types/site"

interface WPCategorySelectProps {
  siteId: string
  selectedCategoryIds: number[]
  onChange: (categoryIds: number[], categoryNames: string[]) => void
  disabled?: boolean
  className?: string
  /** Dari `ControlledField`/`FormField` agar label & pesan galat tersambung ke trigger. */
  id?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

/**
 * Multi-select kategori WordPress situs target (dibaca langsung dari WordPress lewat
 * `sitesQueries.categories`, cache 5 menit). Hanya kategori yang sudah terdaftar di situs.
 */
export function WPCategorySelect({
  siteId,
  selectedCategoryIds,
  onChange,
  disabled = false,
  className,
  id,
  ...aria
}: WPCategorySelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const listId = React.useId()

  const { data: categories = [], isFetching, isPending, error, refetch } = useQuery({
    ...sitesQueries.categories(siteId),
    enabled: Boolean(siteId),
  })
  const isLoading = Boolean(siteId) && isPending

  const byId = React.useMemo(() => new Map(categories.map((category) => [category.id, category] as const)), [categories])
  const selected = selectedCategoryIds.flatMap((categoryId) => {
    const category = byId.get(categoryId)
    return category ? [category] : []
  })
  const needle = search.trim().toLowerCase()
  const filtered = needle
    ? categories.filter((category) => category.name.toLowerCase().includes(needle) || category.slug.toLowerCase().includes(needle))
    : categories

  function emit(ids: number[]) {
    onChange(
      ids,
      ids.flatMap((categoryId) => {
        const name = byId.get(categoryId)?.name
        return name ? [name] : []
      })
    )
  }

  function toggle(category: SiteCategory) {
    emit(
      selectedCategoryIds.includes(category.id)
        ? selectedCategoryIds.filter((categoryId) => categoryId !== category.id)
        : [...selectedCategoryIds, category.id]
    )
  }

  const summary = !siteId
    ? "Pilih website terlebih dahulu"
    : isLoading
      ? "Memuat kategori WordPress..."
      : selected.length === 0
        ? "Pilih satu atau beberapa kategori..."
        : `${selected.length} kategori dipilih`

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled || !siteId}
            {...aria}
            className={cn(
              "flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-left text-xs text-foreground shadow-2xs transition-colors hover:border-foreground/30 dark:bg-background/80",
              "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
              error && "border-destructive/60"
            )}
          >
            <span className={cn("flex items-center gap-2 truncate", selected.length === 0 && "text-muted-foreground")}>
              {isLoading && <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-primary motion-reduce:animate-none" />}
              {summary}
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="flex w-(--radix-popover-trigger-width) min-w-72 flex-col gap-2 p-2">
          <div className="relative">
            <Search aria-hidden="true" className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari kategori blog..."
              aria-label="Cari kategori"
              className="h-8 bg-background pl-8 text-xs"
            />
          </div>

          {error && (
            <div role="alert" className="flex items-center justify-between gap-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive-strong">
              <span>{errorMessage(error, "Gagal memuat kategori dari WordPress.")}</span>
              <Button type="button" variant="ghost" size="xs" onClick={() => void refetch()} className="gap-1 text-destructive-strong hover:bg-destructive/20">
                <RefreshCw aria-hidden="true" className="size-3" />
                Coba lagi
              </Button>
            </div>
          )}

          <div id={listId} role="group" aria-label="Kategori WordPress" className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {isLoading ? (
              <div role="status" className="flex flex-col items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin text-primary motion-reduce:animate-none" />
                Mengambil data dari WordPress...
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {search ? "Kategori tidak ditemukan." : "Tidak ada kategori terdaftar di WordPress."}
              </p>
            ) : (
              filtered.map((category) => {
                const checked = selectedCategoryIds.includes(category.id)
                const optionId = `${listId}-${category.id}`
                return (
                  <label
                    key={category.id}
                    htmlFor={optionId}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-md p-2 text-xs transition-colors select-none",
                      checked ? "bg-primary/10 font-medium" : "hover:bg-muted"
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <Checkbox id={optionId} checked={checked} onCheckedChange={() => toggle(category)} />
                      {category.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{category.count} artikel</span>
                  </label>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs text-muted-foreground">
            <span>Hanya kategori terdaftar di situs</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => void refetch()}
              disabled={isFetching || !siteId}
              className="gap-1 text-muted-foreground"
            >
              <RefreshCw aria-hidden="true" className={cn("size-3", isFetching && "animate-spin motion-reduce:animate-none")} />
              Segarkan
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <ul aria-label="Kategori terpilih" className="flex flex-wrap items-center gap-1.5">
          {selected.map((category) => (
            <li key={category.id}>
              <Badge variant="secondary" className="gap-1 py-0 pr-0.5 text-xs font-normal">
                {category.name}
                <button
                  type="button"
                  onClick={() => emit(selectedCategoryIds.filter((categoryId) => categoryId !== category.id))}
                  disabled={disabled}
                  aria-label={`Hapus kategori ${category.name}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X aria-hidden="true" className="size-2.5" />
                </button>
              </Badge>
            </li>
          ))}
          {selected.length > 1 && (
            <li>
              <Button type="button" variant="ghost" size="xs" onClick={() => emit([])} disabled={disabled} className="text-muted-foreground">
                Hapus semua
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
