import Link from "next/link"
import { BookOpen, ChevronLeft, ChevronRight, FolderOpen, Key, PenLine } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { EmptyState } from "@/components/molecules/empty-state"
import { MarkdownPreview } from "@/components/molecules/markdown-preview"
import { PageHeader } from "@/components/molecules/page-header"
import { CopyMarkdownButton } from "@/components/organisms/docs/copy-markdown-button"
import { DocsNav } from "@/components/organisms/docs/docs-nav"
import { PageContainer } from "@/components/templates/page-container"
import { listUserGuides } from "@/server/services/docs"

export const metadata = { title: "Dokumentasi & Panduan" }

interface DocsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Reader panduan pengguna (`docs/guides`), dirender di server; Markdown dirender tanpa HTML mentah. */
export default async function DocsPage({ searchParams }: DocsPageProps) {
  const [guides, { doc }] = await Promise.all([listUserGuides(), searchParams])
  const activeIndex = Math.max(
    0,
    guides.findIndex((guide) => guide.slug === doc)
  )
  const active = guides[activeIndex]
  const prev = activeIndex > 0 ? guides[activeIndex - 1] : undefined
  const next = guides[activeIndex + 1]

  return (
    <PageContainer>
      <PageHeader
        title="Dokumentasi & Panduan"
        description="Panduan penggunaan Panitera: koneksi WordPress REST API, Agent Profile, penerbitan, dan WP Tools."
        icon={BookOpen}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/keys">
                <Key aria-hidden="true" className="text-primary" />
                Kunci API
              </Link>
            </Button>
            <Button size="sm" asChild className="font-semibold shadow-xs">
              <Link href="/posts/new">
                <PenLine aria-hidden="true" />
                Tulis Artikel
              </Link>
            </Button>
          </>
        }
      />

      {!active ? (
        <EmptyState icon={FolderOpen} title="Panduan belum tersedia" description="Dokumen panduan pengguna belum dipasang pada server ini." />
      ) : (
        <div className="flex flex-col items-start gap-6 md:flex-row">
          <DocsNav
            activeSlug={active.slug}
            items={guides.map((guide) => ({
              slug: guide.slug,
              title: guide.title,
              searchText: `${guide.title}\n${guide.filename}\n${guide.content}`.toLowerCase(),
            }))}
          />

          <article aria-labelledby="guide-title" className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
              <div className="flex min-w-0 flex-col">
                <h2 id="guide-title" className="truncate text-sm font-bold text-foreground sm:text-base">
                  {active.title}
                </h2>
                <span className="truncate font-mono text-xs text-muted-foreground">docs/guides/{active.filename}</span>
              </div>
              <CopyMarkdownButton content={active.content} />
            </div>

            <MarkdownPreview content={active.content} className="rounded-xl p-6 shadow-xs sm:p-8" />

            <nav aria-label="Panduan sebelumnya dan berikutnya" className="flex items-center justify-between gap-3 pt-2">
              {prev ? (
                <Button variant="outline" size="sm" asChild className="max-w-52">
                  <Link href={`/docs?doc=${encodeURIComponent(prev.slug)}`} rel="prev">
                    <ChevronLeft aria-hidden="true" />
                    <span className="truncate">{prev.title}</span>
                  </Link>
                </Button>
              ) : (
                <span />
              )}
              {next && (
                <Button variant="outline" size="sm" asChild className="max-w-52">
                  <Link href={`/docs?doc=${encodeURIComponent(next.slug)}`} rel="next">
                    <span className="truncate">{next.title}</span>
                    <ChevronRight aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </nav>
          </article>
        </div>
      )}
    </PageContainer>
  )
}
