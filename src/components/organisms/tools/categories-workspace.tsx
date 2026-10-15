"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Folder, FolderTree, Sparkles } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { sitesQueries } from "@/lib/api/queries/sites"
import type { SiteCategory } from "@/types/site"
import { CategoryAiPanel } from "./category-ai-panel"
import { CategoryManualForm } from "./category-manual-form"
import { SiteDataPanel } from "./site-data-panel"
import { matchesQuery } from "./tool-helpers"
import { useToolSite } from "./tool-site-context"

/** Isi halaman Kategori Creator: asisten AI / tambah manual (kiri) dan kategori live di WordPress (kanan). */
export function CategoriesWorkspace() {
  const { siteId } = useToolSite()

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <Tabs defaultValue="ai" className="gap-3 lg:col-span-7">
        <TabsList>
          <TabsTrigger value="ai" className="cursor-pointer text-xs font-semibold">
            <Sparkles aria-hidden="true" className="text-primary" />
            Asisten AI
          </TabsTrigger>
          <TabsTrigger value="manual" className="cursor-pointer text-xs">
            Tambah Manual
          </TabsTrigger>
        </TabsList>
        {/* forceMount: berpindah tab tidak membatalkan run AI atau menghapus rekomendasi yang sedang ditinjau. */}
        <TabsContent value="ai" forceMount className="data-[state=inactive]:hidden">
          <CategoryAiPanel siteId={siteId} />
        </TabsContent>
        <TabsContent value="manual" forceMount className="data-[state=inactive]:hidden">
          <CategoryManualForm siteId={siteId} />
        </TabsContent>
      </Tabs>

      <div className="lg:col-span-5">
        <SiteCategoryList siteId={siteId} />
      </div>
    </div>
  )
}

function matchesCategory(category: SiteCategory, query: string): boolean {
  return matchesQuery([category.name, category.slug], query)
}

function SiteCategoryList({ siteId }: { siteId: string }) {
  const query = useQuery(sitesQueries.categories(siteId))
  const parentNames = React.useMemo(
    () => new Map((query.data ?? []).map((category) => [category.id, category.name])),
    [query.data]
  )

  return (
    <SiteDataPanel
      title="Kategori di WordPress"
      description="Struktur taksonomi aktif pada website yang dipilih."
      icon={Folder}
      query={query}
      noun="kategori"
      searchPlaceholder="Cari nama atau slug kategori…"
      matches={matchesCategory}
      emptyTitle="Belum ada kategori"
      emptyDescription="Website ini belum memiliki kategori selain bawaan WordPress, atau REST API membatasi aksesnya."
    >
      {(categories) =>
        categories.map((category) => (
          <li key={category.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
            <div className="flex min-w-0 items-center gap-2.5">
              <FolderTree aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-foreground">{category.name}</span>
                <span className="truncate font-mono text-muted-foreground">/{category.slug}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {category.parent !== 0 && (
                <Badge variant="outline" className="max-w-32 font-normal text-muted-foreground">
                  <span className="truncate">Sub {parentNames.get(category.parent) ?? `#${category.parent}`}</span>
                </Badge>
              )}
              <Badge variant="secondary" className="font-mono">
                {category.count ?? 0} post
              </Badge>
            </div>
          </li>
        ))
      }
    </SiteDataPanel>
  )
}
