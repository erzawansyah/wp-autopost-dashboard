"use client"

import * as React from "react"
import Link from "next/link"
import { FileText } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { SearchInput } from "@/components/molecules/search-input"
import { cn } from "@/lib/utils"

export interface DocsNavItem {
  slug: string
  title: string
  /** Teks pencarian (judul + nama berkas + isi) dalam huruf kecil. */
  searchText: string
}

interface DocsNavProps {
  items: DocsNavItem[]
  activeSlug: string
}

/** Daftar panduan dengan pencarian instan; tiap entri adalah tautan `/docs?doc=<slug>` (dirender server). */
export function DocsNav({ items, activeSlug }: DocsNavProps) {
  const [query, setQuery] = React.useState("")
  const deferredQuery = React.useDeferredValue(query.trim().toLowerCase())
  const visibleItems = deferredQuery ? items.filter((item) => item.searchText.includes(deferredQuery)) : items

  return (
    <nav aria-label="Daftar panduan" className="flex w-full shrink-0 flex-col gap-3 md:w-64 lg:w-72">
      <SearchInput
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onClear={() => setQuery("")}
        placeholder="Cari topik panduan…"
        aria-label="Cari panduan"
      />
      <div className="flex flex-col gap-0.5 rounded-xl border border-border/80 bg-card p-1.5 shadow-2xs">
        <div className="flex items-center justify-between px-2.5 py-1.5 font-mono text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
          <span>Daftar panduan</span>
          <Badge variant="secondary" className="px-1.5 py-0 text-2xs" aria-live="polite">
            {visibleItems.length} panduan
          </Badge>
        </div>
        {visibleItems.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Tidak ada panduan yang cocok.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visibleItems.map((item) => {
              const isActive = item.slug === activeSlug
              return (
                <li key={item.slug}>
                  <Link
                    href={`/docs?doc=${encodeURIComponent(item.slug)}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      isActive
                        ? "border-primary/20 bg-primary/10 font-semibold text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <FileText aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </nav>
  )
}
