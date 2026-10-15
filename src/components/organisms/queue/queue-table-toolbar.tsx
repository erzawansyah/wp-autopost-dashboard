"use client"

import * as React from "react"
import { Globe, RotateCcw } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Label } from "@/components/atoms/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select"
import { Switch } from "@/components/atoms/switch"
import { SearchInput } from "@/components/molecules/search-input"
import { STATUS_GROUP_LABELS, STATUS_GROUPS, type StatusGroup } from "@/lib/queue/states"
import { cn } from "@/lib/utils"

export type StatusFilter = StatusGroup | "all"

export interface SiteFilterOption {
  domain: string
  name: string
}

interface QueueTableToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  sites: SiteFilterOption[]
  site: string
  onSiteChange: (domain: string) => void
  status: StatusFilter
  onStatusChange: (status: StatusFilter) => void
  statusCounts: Record<StatusFilter, number>
  grouped: boolean
  onGroupedChange: (grouped: boolean) => void
  isFilterActive: boolean
  onReset: () => void
  /** Filter tambahan dari halaman (mis. pemilih batch yang mengubah URL). */
  children?: React.ReactNode
}

const ALL_SITES = "all"

/** Toolbar tabel antrean: pencarian, filter situs & status, pengelompokan per batch, reset. */
export function QueueTableToolbar({
  search,
  onSearchChange,
  sites,
  site,
  onSiteChange,
  status,
  onStatusChange,
  statusCounts,
  grouped,
  onGroupedChange,
  isFilterActive,
  onReset,
  children,
}: QueueTableToolbarProps) {
  const groupSwitchId = React.useId()
  const pills: Array<{ id: StatusFilter; label: string }> = [
    { id: "all", label: "Semua" },
    ...STATUS_GROUPS.map((group) => ({ id: group, label: STATUS_GROUP_LABELS[group] })),
  ]

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border/80 bg-card p-3 shadow-2xs">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full lg:max-w-md">
          <SearchInput
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onClear={() => onSearchChange("")}
            placeholder="Cari judul, topik, kategori, batch, atau domain..."
            aria-label="Cari artikel di antrean"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {children}

          {sites.length > 0 && (
            <Select value={site} onValueChange={onSiteChange}>
              <SelectTrigger className="h-8 w-52 bg-background text-xs" aria-label="Filter website">
                <Globe aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                <SelectValue placeholder="Semua website" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL_SITES} className="text-xs">
                    Semua website
                  </SelectItem>
                  {sites.map((option) => (
                    <SelectItem key={option.domain} value={option.domain} className="text-xs">
                      {option.name} ({option.domain})
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-2 rounded-md border border-border/70 px-2.5 py-1.5">
            <Switch id={groupSwitchId} checked={grouped} onCheckedChange={onGroupedChange} />
            <Label htmlFor={groupSwitchId} className="cursor-pointer text-xs font-medium">
              Kelompokkan per batch
            </Label>
          </div>

          {isFilterActive && (
            <Button variant="ghost" size="sm" onClick={onReset} className="h-8 gap-1 px-2 text-xs text-muted-foreground">
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Reset filter
            </Button>
          )}
        </div>
      </div>

      <div
        role="group"
        aria-label="Filter status artikel"
        className="flex items-center gap-1.5 overflow-x-auto border-t border-border/60 pt-2.5 pb-0.5"
      >
        {pills.map((pill) => {
          const selected = status === pill.id
          const count = statusCounts[pill.id]
          const alert = pill.id === "failed" && count > 0
          return (
            <button
              key={pill.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onStatusChange(pill.id)}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                selected
                  ? "bg-primary font-semibold text-primary-foreground shadow-2xs"
                  : "border border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {pill.label}
              <span
                className={cn(
                  "rounded-full px-1.5 font-mono text-2xs font-semibold",
                  selected
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : alert
                      ? "bg-destructive/15 text-destructive-strong"
                      : "bg-background/80 text-muted-foreground"
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { ALL_SITES }
