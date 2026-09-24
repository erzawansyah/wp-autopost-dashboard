"use client"

import * as React from "react"
import { Globe, Plus, Sparkles, Upload, User, Bell } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { ModeToggle } from "@/components/molecules/mode-toggle"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"

interface TopNavbarProps {
  onOpenQuickPost?: () => void
  onOpenBulkBatch?: () => void
  selectedSite?: string
  onSelectSite?: (siteId: string) => void
}

export function TopNavbar({
  onOpenQuickPost,
  onOpenBulkBatch,
  selectedSite = "all",
  onSelectSite,
}: TopNavbarProps) {
  return (
    <header className="h-16 px-6 border-b border-border/80 bg-card/60 backdrop-blur-md flex items-center justify-between gap-4 sticky top-0 z-30">
      {/* Left: Global Site Selector & Context */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Globe className="size-4 text-primary" />
          <span>Situs Aktif:</span>
        </div>
        <Select
          value={selectedSite}
          onValueChange={(val) => onSelectSite && onSelectSite(val)}
        >
          <SelectTrigger className="h-9 w-48 text-xs font-medium bg-background border-border/80 shadow-2xs">
            <SelectValue placeholder="Pilih Situs WordPress" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Situs (Multi-Site)</SelectItem>
            <SelectItem value="site-1">Nusantara Living (ID)</SelectItem>
            <SelectItem value="site-2">Finansial Kita</SelectItem>
            <SelectItem value="site-3">Otomotif Trend</SelectItem>
            <SelectItem value="site-4">Tech Warta Digital</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Right: Quick Action CTAs & Controls */}
      <div className="flex items-center gap-2.5">
        {onOpenBulkBatch && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenBulkBatch}
            className="cursor-pointer gap-2 border-border/80 text-xs font-semibold shadow-2xs hover:bg-secondary"
          >
            <Upload className="size-3.5 text-muted-foreground" />
            <span>Bulk CSV Batch</span>
          </Button>
        )}

        {onOpenQuickPost && (
          <Button
            variant="default"
            size="sm"
            onClick={onOpenQuickPost}
            className="cursor-pointer gap-2 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xs"
          >
            <Plus className="size-3.5 text-accent" />
            <span>Quick Single Post</span>
          </Button>
        )}

        <div className="h-4 w-px bg-border mx-1" />

        <ModeToggle />

        {/* User Profile Avatar */}
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full bg-muted/60 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <User className="size-4" />
        </Button>
      </div>
    </header>
  )
}
