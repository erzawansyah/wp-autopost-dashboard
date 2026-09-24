"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2, RefreshCw, Search, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Checkbox } from "@/components/atoms/checkbox"
import { cn } from "@/lib/utils"

export interface WPCategoryOption {
  id: number
  name: string
  slug: string
  count: number
  parent: number
}

interface WPCategorySelectProps {
  siteId: string
  selectedCategoryIds: number[]
  onChange: (categoryIds: number[], categoryNames: string[]) => void
  disabled?: boolean
  className?: string
}

export function WPCategorySelect({
  siteId,
  selectedCategoryIds,
  onChange,
  disabled = false,
  className,
}: WPCategorySelectProps) {
  const [open, setOpen] = React.useState(false)
  const [categories, setCategories] = React.useState<WPCategoryOption[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")

  const handleRefresh = React.useCallback(async () => {
    if (!siteId) return
    setIsLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/categories`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Gagal memuat kategori dari WordPress")
      }
      setCategories(Array.isArray(data.categories) ? data.categories : [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal memuat kategori"
      setErrorMsg(message)
    } finally {
      setIsLoading(false)
    }
  }, [siteId])

  // Auto fetch saat siteId berubah dengan pembatalan request lama
  React.useEffect(() => {
    let ignore = false

    async function loadData() {
      if (!siteId) {
        setCategories([])
        setErrorMsg(null)
        return
      }

      setIsLoading(true)
      setErrorMsg(null)

      try {
        const res = await fetch(`/api/sites/${siteId}/categories`)
        const data = await res.json()

        if (!ignore) {
          if (!res.ok) {
            throw new Error(data.error || "Gagal memuat kategori dari WordPress")
          }
          setCategories(Array.isArray(data.categories) ? data.categories : [])
        }
      } catch (err: unknown) {
        if (!ignore) {
          const message = err instanceof Error ? err.message : "Gagal memuat kategori"
          setErrorMsg(message)
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      ignore = true
    }
  }, [siteId])

  // Map category IDs to names
  const categoryMap = React.useMemo(() => {
    const map = new Map<number, WPCategoryOption>()
    for (const cat of categories) {
      map.set(cat.id, cat)
    }
    return map
  }, [categories])

  const selectedCategories = React.useMemo(() => {
    return selectedCategoryIds
      .map((id) => categoryMap.get(id))
      .filter((cat): cat is WPCategoryOption => Boolean(cat))
  }, [selectedCategoryIds, categoryMap])

  // Filter categories by search
  const filteredCategories = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return categories
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q)
    )
  }, [categories, searchQuery])

  const handleToggleCategory = (cat: WPCategoryOption) => {
    const isSelected = selectedCategoryIds.includes(cat.id)
    let newIds: number[]

    if (isSelected) {
      newIds = selectedCategoryIds.filter((id) => id !== cat.id)
    } else {
      newIds = [...selectedCategoryIds, cat.id]
    }

    const newNames = newIds
      .map((id) => categoryMap.get(id)?.name || "")
      .filter(Boolean)

    onChange(newIds, newNames)
  }

  const handleRemoveCategory = (e: React.MouseEvent, catId: number) => {
    e.stopPropagation()
    const newIds = selectedCategoryIds.filter((id) => id !== catId)
    const newNames = newIds
      .map((id) => categoryMap.get(id)?.name || "")
      .filter(Boolean)

    onChange(newIds, newNames)
  }

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange([], [])
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || !siteId || isLoading}
            className={cn(
              "flex min-h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1.5 text-xs shadow-xs transition-colors",
              "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
              errorMsg && "border-destructive/60"
            )}
          >
            <div className="flex flex-1 flex-wrap items-center gap-1.5 text-left">
              {!siteId ? (
                <span className="text-muted-foreground">Pilih website terlebih dahulu</span>
              ) : isLoading ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>Memuat kategori WordPress...</span>
                </span>
              ) : selectedCategories.length === 0 ? (
                <span className="text-muted-foreground">Pilih satu atau beberapa kategori...</span>
              ) : (
                selectedCategories.map((cat) => (
                  <Badge
                    key={cat.id}
                    variant="secondary"
                    className="flex items-center gap-1 px-2 py-0 text-[11px] font-normal"
                  >
                    <span>{cat.name}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleRemoveCategory(e, cat.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          handleRemoveCategory(e as unknown as React.MouseEvent, cat.id)
                        }
                      }}
                      className="cursor-pointer rounded-full p-0.5 hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-2.5" />
                    </span>
                  </Badge>
                ))
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-2">
              {selectedCategoryIds.length > 0 && !disabled && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleClearAll}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleClearAll(e as unknown as React.MouseEvent)
                    }
                  }}
                  title="Hapus semua pilihan"
                  className="cursor-pointer text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X className="size-3" />
                </span>
              )}
              <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-2 space-y-2 bg-popover text-popover-foreground border-border shadow-md"
        >
          {/* Header Search Filter */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kategori blog..."
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>

          {/* Error State with Retry Button */}
          {errorMsg && (
            <div className="p-2 rounded bg-destructive/10 border border-destructive/30 text-destructive text-[11px] flex items-center justify-between gap-2">
              <span>{errorMsg}</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleRefresh}
                className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/20 cursor-pointer"
              >
                <RefreshCw className="size-3 mr-1" />
                Coba lagi
              </Button>
            </div>
          )}

          {/* Category List */}
          <div className="max-h-56 overflow-y-auto space-y-0.5 divide-y divide-border/20">
            {isLoading ? (
              <div className="py-6 flex flex-col items-center justify-center text-xs text-muted-foreground gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>Mengambil data dari WordPress...</span>
              </div>
            ) : filteredCategories.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {searchQuery ? "Kategori tidak ditemukan." : "Tidak ada kategori terdaftar di WordPress."}
              </div>
            ) : (
              filteredCategories.map((cat) => {
                const isSelected = selectedCategoryIds.includes(cat.id)
                return (
                  <div
                    key={cat.id}
                    onClick={() => handleToggleCategory(cat)}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-md text-xs cursor-pointer select-none transition-colors",
                      isSelected
                        ? "bg-primary/10 text-foreground font-medium"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleCategory(cat)}
                        className="pointer-events-none"
                      />
                      <span>{cat.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {cat.count} artikel
                      </span>
                      {isSelected && <Check className="size-3.5 text-primary" />}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Info Footer: Tanpa Buat Baru */}
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Hanya kategori terdaftar di situs</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleRefresh}
              disabled={isLoading || !siteId}
              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer gap-1"
            >
              <RefreshCw className={cn("size-3", isLoading && "animate-spin")} />
              <span>Segarkan</span>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
