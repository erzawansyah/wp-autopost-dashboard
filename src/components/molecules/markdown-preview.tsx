import * as React from "react"
import { isSafeUrl } from "@/lib/sanitize-html"
import { cn } from "@/lib/utils"

interface MarkdownPreviewProps {
  content: string
  /** Teks saat konten kosong. */
  emptyMessage?: string
  className?: string
}

/**
 * Pratinjau Markdown ringan (heading, code block, tabel, daftar, tautan, inline code, tebal/miring, kutipan,
 * garis). Aman untuk konten tak tepercaya (SKILL.md, workflow prompt, panduan): semuanya dirender sebagai
 * elemen React (teks di-escape, tanpa `dangerouslySetInnerHTML`) dan `href` tautan disaring `isSafeUrl`
 * (hanya http/https/mailto/tel/relatif; `javascript:` dsb. dirender sebagai teks biasa).
 * Tanpa hook/"use client": dapat dirender dari Server Component (reader `/docs`) maupun Client Component.
 */
export function MarkdownPreview({ content, emptyMessage = "Belum ada konten untuk dipratinjau.", className }: MarkdownPreviewProps) {
  if (!content.trim()) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 py-20 text-center text-xs text-muted-foreground italic",
          className
        )}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "article-rendered max-w-none overflow-y-auto rounded-lg border border-border/80 bg-card p-5 text-xs leading-relaxed shadow-2xs",
        className
      )}
    >
      {renderBlocks(content)}
    </div>
  )
}

type ListBuffer = { type: "ul" | "ol"; items: string[] }

function parseTableRow(row: string): string[] {
  return row
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim())
}

function renderBlocks(content: string): React.ReactNode[] {
  const lines = content.split("\n")
  const elements: React.ReactNode[] = []

  // Holder objek (bukan `let`) agar narrowing TypeScript tetap benar walau diubah di dalam closure flush*.
  const list: { current: ListBuffer | null } = { current: null }
  const table: { current: string[] | null } = { current: null }
  let inCodeBlock = false
  let codeBlockLang = ""
  let codeBlockContent: string[] = []

  const flushList = () => {
    if (!list.current) return
    const { type, items } = list.current
    list.current = null
    const ListTag = type
    elements.push(
      <ListTag
        key={`${type}-${elements.length}`}
        className={cn("my-3 flex flex-col gap-1.5 pl-6 text-xs text-foreground/90", type === "ul" ? "list-disc" : "list-decimal")}
      >
        {items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ListTag>
    )
  }

  const flushTable = () => {
    const rows = table.current
    table.current = null
    if (!rows || rows.length === 0) return

    const headerCells = parseTableRow(rows[0])
    // Baris kedua biasanya pemisah: |---|---|
    const bodyRows = rows.length > 1 && rows[1].includes("---") ? rows.slice(2) : rows.slice(1)

    elements.push(
      <div key={`table-${elements.length}`} className="my-4 overflow-x-auto rounded-lg border border-border shadow-2xs">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="border-b border-border bg-muted/70 font-semibold text-foreground">
            <tr>
              {headerCells.map((head, idx) => (
                <th key={idx} scope="col" className="border-r border-border/70 p-2.5 font-medium last:border-r-0">
                  {renderInlineMarkdown(head)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 bg-card">
            {bodyRows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {parseTableRow(row).map((cell, cellIdx) => (
                  <td key={cellIdx} className="border-r border-border/50 p-2.5 text-foreground/90 last:border-r-0">
                    {renderInlineMarkdown(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const pushCodeBlock = (key: string) => {
    elements.push(
      <div key={key} className="my-3 overflow-hidden rounded-lg border border-border bg-muted/40 shadow-2xs">
        {codeBlockLang && (
          <div className="border-b border-border/70 bg-muted/80 px-3 py-1 font-mono text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            {codeBlockLang}
          </div>
        )}
        <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed text-foreground">
          <code>{codeBlockContent.join("\n")}</code>
        </pre>
      </div>
    )
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // 1. Fenced code block (```lang ... ```)
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        pushCodeBlock(`code-${elements.length}`)
        inCodeBlock = false
        codeBlockLang = ""
        codeBlockContent = []
      } else {
        flushList()
        flushTable()
        inCodeBlock = true
        codeBlockLang = trimmed.slice(3).trim()
        codeBlockContent = []
      }
      continue
    }
    if (inCodeBlock) {
      codeBlockContent.push(rawLine)
      continue
    }

    // 2. Tabel (| kolom | kolom |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList()
      table.current ??= []
      table.current.push(trimmed)
      continue
    }
    flushTable()

    // 3. Baris kosong
    if (!trimmed) {
      flushList()
      continue
    }

    // 4. Heading (# → h2 agar h1 tetap milik PageHeader)
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushList()
      const level = heading[1].length
      const text = renderInlineMarkdown(heading[2])
      if (level === 1) {
        elements.push(
          <h2 key={`h-${i}`} className="mt-6 mb-3 border-b border-border pb-2 text-base font-extrabold text-foreground">
            {text}
          </h2>
        )
      } else if (level === 2) {
        elements.push(
          <h3 key={`h-${i}`} className="mt-5 mb-2 border-b border-border/70 pb-1.5 text-sm font-bold text-foreground">
            {text}
          </h3>
        )
      } else {
        const HeadingTag = level === 3 ? "h4" : "h5"
        elements.push(
          <HeadingTag key={`h-${i}`} className="mt-4 mb-2 flex items-center gap-1.5 text-xs font-bold text-foreground">
            <span aria-hidden="true" className={cn("shrink-0 rounded-full bg-primary", level === 3 ? "size-2" : "size-1.5 opacity-70")} />
            {text}
          </HeadingTag>
        )
      }
      continue
    }

    // 5. Garis horizontal
    if (trimmed === "---" || trimmed === "***") {
      flushList()
      elements.push(<hr key={`hr-${i}`} className="my-4 border-border/80" />)
      continue
    }

    // 6. Kutipan
    if (trimmed.startsWith("> ")) {
      flushList()
      elements.push(
        <blockquote key={`bq-${i}`} className="my-2.5 rounded-r border-l-3 border-primary bg-primary/5 py-2 pl-3 text-xs text-foreground/80 italic">
          {renderInlineMarkdown(trimmed.slice(2))}
        </blockquote>
      )
      continue
    }

    // 7. Daftar tak berurut (- / *) dan berurut (1.)
    const unordered = /^(\s*)(?:-|\*)\s+(.*)$/.exec(rawLine)
    const ordered = unordered ? null : /^(\s*)\d+\.\s+(.*)$/.exec(rawLine)
    const listMatch = unordered ?? ordered
    if (listMatch) {
      const type = unordered ? "ul" : "ol"
      if (list.current?.type !== type) flushList()
      list.current ??= { type, items: [] }
      list.current.items.push(unordered && listMatch[1].length > 0 ? `  ${listMatch[2]}` : listMatch[2])
      continue
    }

    // 8. Paragraf
    flushList()
    elements.push(
      <p key={`p-${i}`} className="my-2 text-xs leading-relaxed text-foreground/85">
        {renderInlineMarkdown(trimmed)}
      </p>
    )
  }

  flushList()
  flushTable()
  if (inCodeBlock && codeBlockContent.length > 0) pushCodeBlock("code-final")

  return elements
}

const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g

/** Inline: `kode`, [tautan](url) tersaring, **tebal**, *miring*. */
function renderInlineMarkdown(text: string): React.ReactNode {
  return text.split(/(`[^`]+`)/g).map((part, partIdx) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={`code-${partIdx}`}
          className="mx-0.5 inline-block rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary shadow-2xs"
        >
          {part.slice(1, -1)}
        </code>
      )
    }

    const nodes: React.ReactNode[] = []
    let lastIndex = 0
    for (const match of part.matchAll(LINK_PATTERN)) {
      const index = match.index ?? 0
      if (index > lastIndex) nodes.push(renderBoldAndItalic(part.slice(lastIndex, index), `${partIdx}-${lastIndex}`))
      nodes.push(renderLink(match[1], match[2].trim(), `link-${partIdx}-${index}`))
      lastIndex = index + match[0].length
    }
    if (lastIndex < part.length) nodes.push(renderBoldAndItalic(part.slice(lastIndex), `${partIdx}-${lastIndex}`))

    return <React.Fragment key={`part-${partIdx}`}>{nodes}</React.Fragment>
  })
}

/** Tautan hanya bila URL aman; internal (`/…`, `#…`) di tab yang sama, eksternal di tab baru. */
function renderLink(label: string, href: string, key: string): React.ReactNode {
  if (!isSafeUrl(href, "link")) return <React.Fragment key={key}>{renderBoldAndItalic(label, key)}</React.Fragment>
  const isInternal = (href.startsWith("/") && !href.startsWith("//")) || href.startsWith("#")
  return (
    <a
      key={key}
      href={href}
      {...(isInternal ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" })}
      className="font-medium text-primary underline underline-offset-2 transition-opacity hover:opacity-80"
    >
      {renderBoldAndItalic(label, key)}
    </a>
  )
}

function renderBoldAndItalic(text: string, baseKey: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((boldPart, boldIdx) => {
    if (boldPart.startsWith("**") && boldPart.endsWith("**") && boldPart.length > 4) {
      return (
        <strong key={`b-${baseKey}-${boldIdx}`} className="font-bold text-foreground">
          {boldPart.slice(2, -2)}
        </strong>
      )
    }
    return boldPart.split(/(\*[^*]+\*)/g).map((italicPart, italicIdx) => {
      if (italicPart.startsWith("*") && italicPart.endsWith("*") && italicPart.length > 2) {
        return (
          <em key={`i-${baseKey}-${boldIdx}-${italicIdx}`} className="text-foreground/90 italic">
            {italicPart.slice(1, -1)}
          </em>
        )
      }
      return italicPart
    })
  })
}
