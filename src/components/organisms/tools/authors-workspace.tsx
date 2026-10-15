"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronUp, Sparkles, Users } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { sitesQueries } from "@/lib/api/queries/sites"
import type { SiteAuthor } from "@/types/site"
import { AuthorAiPanel } from "./author-ai-panel"
import { AuthorInitial } from "./author-initial"
import { AuthorManualForm } from "./author-manual-form"
import { SiteDataPanel } from "./site-data-panel"
import { matchesQuery } from "./tool-helpers"
import { useToolSite } from "./tool-site-context"

/** Isi halaman Author Creator: asisten AI persona / tambah manual (kiri) dan author live di WordPress (kanan). */
export function AuthorsWorkspace() {
  const { siteId } = useToolSite()

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <Tabs defaultValue="ai" className="gap-3 lg:col-span-7">
        <TabsList>
          <TabsTrigger value="ai" className="cursor-pointer text-xs font-semibold">
            <Sparkles aria-hidden="true" className="text-primary" />
            Asisten AI Persona
          </TabsTrigger>
          <TabsTrigger value="manual" className="cursor-pointer text-xs">
            Tambah Manual
          </TabsTrigger>
        </TabsList>
        {/* forceMount: berpindah tab tidak membatalkan run AI atau menghapus kandidat yang sedang ditinjau. */}
        <TabsContent value="ai" forceMount className="data-[state=inactive]:hidden">
          <AuthorAiPanel siteId={siteId} />
        </TabsContent>
        <TabsContent value="manual" forceMount className="data-[state=inactive]:hidden">
          <AuthorManualForm siteId={siteId} />
        </TabsContent>
      </Tabs>

      <div className="lg:col-span-5">
        <SiteAuthorList siteId={siteId} />
      </div>
    </div>
  )
}

function matchesAuthor(author: SiteAuthor, query: string): boolean {
  return matchesQuery([author.name, author.slug, author.description], query)
}

function SiteAuthorList({ siteId }: { siteId: string }) {
  const query = useQuery(sitesQueries.authors(siteId))

  return (
    <SiteDataPanel
      title="Author & Bio di WordPress"
      description="Profil pengguna yang terdaftar di website yang dipilih."
      icon={Users}
      query={query}
      noun="author"
      searchPlaceholder="Cari nama, username, atau isi bio…"
      matches={matchesAuthor}
      emptyTitle="Belum ada author"
      emptyDescription="Tidak ada author yang ditemukan, atau hak akses REST API pengguna WordPress ini dibatasi."
    >
      {(authors) => authors.map((author) => <SiteAuthorRow key={author.id} author={author} />)}
    </SiteDataPanel>
  )
}

/** Bio di atas panjang ini diringkas 2 baris dengan tombol "Selengkapnya". */
const BIO_COLLAPSE_CHARS = 100

function SiteAuthorRow({ author }: { author: SiteAuthor }) {
  const [expanded, setExpanded] = React.useState(false)
  const bioId = React.useId()
  const bio = author.description?.trim() ?? ""

  return (
    <li className="flex flex-col gap-2 px-4 py-3.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <AuthorInitial name={author.name} className="size-7 text-xs" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-foreground">{author.name}</span>
            <span className="truncate font-mono text-muted-foreground">@{author.slug}</span>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 font-mono">
          ID #{author.id}
        </Badge>
      </div>

      {bio ? (
        <div className="rounded-md border border-border/40 bg-muted/30 p-2 leading-relaxed text-muted-foreground">
          <p id={bioId} className={expanded ? undefined : "line-clamp-2"}>
            {bio}
          </p>
          {bio.length > BIO_COLLAPSE_CHARS && (
            <Button
              type="button"
              variant="link"
              size="xs"
              aria-expanded={expanded}
              aria-controls={bioId}
              onClick={() => setExpanded((value) => !value)}
              className="mt-1 h-auto cursor-pointer px-0"
            >
              {expanded ? (
                <ChevronUp aria-hidden="true" data-icon="inline-start" />
              ) : (
                <ChevronDown aria-hidden="true" data-icon="inline-start" />
              )}
              {expanded ? "Ringkas" : "Selengkapnya"}
              <span className="sr-only"> bio {author.name}</span>
            </Button>
          )}
        </div>
      ) : (
        <span className="text-muted-foreground italic">Belum ada biografi di WordPress.</span>
      )}
    </li>
  )
}
