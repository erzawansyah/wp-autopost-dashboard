"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface MarkdownPreviewProps {
  content: string
  className?: string
}

/**
 * Komponen Molecule untuk merender pratinjau Markdown & Workflow Prompt secara elegan
 * Mendukung full heading, code blocks (```), tables, lists, links, inline code, bold, italic, dan blockquotes.
 */
export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  if (!content || !content.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground italic text-xs border border-dashed border-border rounded-lg bg-card/40">
        Belum ada instruksi prompt yang ditulis. Beralih ke mode &quot;Raw&quot; untuk mulai menulis prompt atau memuat preset.
      </div>
    )
  }

  const lines = content.split("\n")
  const elements: React.ReactNode[] = []

  let listBuffer: { type: "ul" | "ol"; items: string[] } | null = null
  let tableBuffer: string[] | null = null
  let inCodeBlock = false
  let codeBlockLang = ""
  let codeBlockContent: string[] = []

  const flushList = () => {
    if (!listBuffer) return
    const currentBuffer = listBuffer
    listBuffer = null

    if (currentBuffer.type === "ul") {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-3 space-y-1.5 pl-6 list-disc text-xs text-foreground/90">
          {currentBuffer.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      )
    } else {
      elements.push(
        <ol key={`ol-${elements.length}`} className="my-3 space-y-1.5 pl-6 list-decimal text-xs text-foreground/90">
          {currentBuffer.items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ol>
      )
    }
  }

  const flushTable = () => {
    if (!tableBuffer || tableBuffer.length === 0) return
    const currentTable = tableBuffer
    tableBuffer = null

    const parseRow = (rowStr: string) =>
      rowStr
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())

    const headerCells = parseRow(currentTable[0])
    // Baris kedua biasanya pemisah: |---|---|
    const hasSeparator = currentTable.length > 1 && currentTable[1].includes("---")
    const bodyRows = hasSeparator ? currentTable.slice(2) : currentTable.slice(1)

    elements.push(
      <div key={`table-${elements.length}`} className="my-4 overflow-x-auto rounded-lg border border-border shadow-2xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-muted/70 text-foreground font-semibold border-b border-border">
            <tr>
              {headerCells.map((head, idx) => (
                <th key={idx} className="p-2.5 font-medium border-r last:border-r-0 border-border/70">
                  {renderInlineMarkdown(head)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 bg-card">
            {bodyRows.map((rowStr, rIdx) => {
              const cells = parseRow(rowStr)
              return (
                <tr key={rIdx} className="hover:bg-muted/30 transition-colors">
                  {cells.map((cell, cIdx) => (
                    <td key={cIdx} className="p-2.5 border-r last:border-r-0 border-border/50 text-foreground/90">
                      {renderInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // 1. Fenced Code Blocks (```lang ... ```)
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        // Akhir code block
        elements.push(
          <div key={`codeblock-${elements.length}`} className="my-3 rounded-lg overflow-hidden border border-border bg-muted/40 shadow-2xs">
            {codeBlockLang && (
              <div className="bg-muted/80 px-3 py-1 text-[10px] font-mono text-muted-foreground border-b border-border/70 uppercase tracking-wider font-semibold">
                {codeBlockLang}
              </div>
            )}
            <pre className="p-3.5 text-xs font-mono overflow-x-auto text-foreground leading-relaxed">
              <code>{codeBlockContent.join("\n")}</code>
            </pre>
          </div>
        )
        inCodeBlock = false
        codeBlockLang = ""
        codeBlockContent = []
        continue
      } else {
        flushList()
        flushTable()
        inCodeBlock = true
        codeBlockLang = trimmed.slice(3).trim()
        codeBlockContent = []
        continue
      }
    }

    if (inCodeBlock) {
      codeBlockContent.push(rawLine)
      continue
    }

    // 2. Tabel Markdown (| col1 | col2 |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList()
      if (!tableBuffer) {
        tableBuffer = []
      }
      tableBuffer.push(trimmed)
      continue
    } else {
      flushTable()
    }

    // 3. Baris Kosong
    if (!trimmed) {
      flushList()
      continue
    }

    // 4. Headings (#, ##, ###, ####)
    if (trimmed.startsWith("#### ")) {
      flushList()
      elements.push(
        <h5 key={`h5-${i}`} className="text-xs font-bold text-foreground mt-3.5 mb-1.5 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary/70 shrink-0" />
          {renderInlineMarkdown(trimmed.slice(5))}
        </h5>
      )
      continue
    }

    if (trimmed.startsWith("### ")) {
      flushList()
      elements.push(
        <h4 key={`h4-${i}`} className="text-xs font-bold text-foreground mt-4 mb-2 flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary shrink-0" />
          {renderInlineMarkdown(trimmed.slice(4))}
        </h4>
      )
      continue
    }

    if (trimmed.startsWith("## ")) {
      flushList()
      elements.push(
        <h3 key={`h3-${i}`} className="text-sm font-bold text-foreground mt-5 mb-2 pb-1.5 border-b border-border/70">
          {renderInlineMarkdown(trimmed.slice(3))}
        </h3>
      )
      continue
    }

    if (trimmed.startsWith("# ")) {
      flushList()
      elements.push(
        <h2 key={`h2-${i}`} className="text-base font-extrabold text-foreground mt-6 mb-3 pb-2 border-b border-border">
          {renderInlineMarkdown(trimmed.slice(2))}
        </h2>
      )
      continue
    }

    // 5. Horizontal Rule
    if (trimmed === "---" || trimmed === "***") {
      flushList()
      elements.push(<hr key={`hr-${i}`} className="my-4 border-border/80" />)
      continue
    }

    // 6. Blockquote
    if (trimmed.startsWith("> ")) {
      flushList()
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-3 border-primary bg-primary/5 pl-3 py-2 my-2.5 rounded-r text-xs italic text-foreground/80">
          {renderInlineMarkdown(trimmed.slice(2))}
        </blockquote>
      )
      continue
    }

    // 7. Unordered List (- atau *)
    const ulMatch = rawLine.match(/^(\s*)(?:-|\*)\s+(.*)$/)
    if (ulMatch) {
      const indent = ulMatch[1].length
      const itemContent = ulMatch[2]
      if (!listBuffer || listBuffer.type !== "ul") {
        flushList()
        listBuffer = { type: "ul", items: [] }
      }
      listBuffer.items.push(indent > 0 ? `  ${itemContent}` : itemContent)
      continue
    }

    // 8. Ordered List (1. 2. dll.)
    const olMatch = rawLine.match(/^(\s*)\d+\.\s+(.*)$/)
    if (olMatch) {
      const itemContent = olMatch[2]
      if (!listBuffer || listBuffer.type !== "ol") {
        flushList()
        listBuffer = { type: "ol", items: [] }
      }
      listBuffer.items.push(itemContent)
      continue
    }

    // 9. Paragraf Normal
    flushList()
    elements.push(
      <p key={`p-${i}`} className="text-xs leading-relaxed text-foreground/85 my-2">
        {renderInlineMarkdown(trimmed)}
      </p>
    )
  }

  // Bersihkan buffer sisa jika ada
  flushList()
  flushTable()

  if (inCodeBlock && codeBlockContent.length > 0) {
    elements.push(
      <div key={`codeblock-final`} className="my-3 rounded-lg overflow-hidden border border-border bg-muted/40 shadow-2xs">
        <pre className="p-3 text-xs font-mono overflow-x-auto text-foreground">
          <code>{codeBlockContent.join("\n")}</code>
        </pre>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "article-rendered prose dark:prose-invert max-w-none text-xs leading-relaxed p-5 rounded-lg bg-card border border-border/80 min-h-[480px] overflow-y-auto shadow-2xs",
        className
      )}
    >
      {elements}
    </div>
  )
}

/**
 * Helper untuk merender inline formatting: code tags (`code`), links ([text](url)), bold (**bold**), italic (*italic*)
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  // 1. Tangani inline code blocks `...`
  const codeParts = text.split(/(`[^`]+`)/g)

  return codeParts.map((part, pIdx) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      const codeContent = part.slice(1, -1)
      return (
        <code
          key={`code-${pIdx}`}
          className="bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold mx-0.5 inline-block shadow-2xs"
        >
          {codeContent}
        </code>
      )
    }

    // 2. Tangani Markdown Link: [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
    const subParts: React.ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = linkRegex.exec(part)) !== null) {
      if (match.index > lastIndex) {
        subParts.push(renderBoldAndItalic(part.substring(lastIndex, match.index), `${pIdx}-${lastIndex}`))
      }
      const linkText = match[1]
      const linkUrl = match[2]
      subParts.push(
        <a
          key={`link-${pIdx}-${match.index}`}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 font-medium hover:opacity-80 transition-opacity"
        >
          {linkText}
        </a>
      )
      lastIndex = linkRegex.lastIndex
    }

    if (lastIndex < part.length) {
      subParts.push(renderBoldAndItalic(part.substring(lastIndex), `${pIdx}-${lastIndex}`))
    }

    return <React.Fragment key={`sub-${pIdx}`}>{subParts}</React.Fragment>
  })
}

/**
 * Sub-helper untuk format bold & italic
 */
function renderBoldAndItalic(text: string, baseKey: string): React.ReactNode {
  // Pisahkan **bold**
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g)

  return boldParts.map((bPart, bIdx) => {
    if (bPart.startsWith("**") && bPart.endsWith("**") && bPart.length > 4) {
      return (
        <strong key={`b-${baseKey}-${bIdx}`} className="font-bold text-foreground">
          {bPart.slice(2, -2)}
        </strong>
      )
    }

    // Pisahkan *italic*
    const italicParts = bPart.split(/(\*[^*]+\*)/g)
    return italicParts.map((iPart, iIdx) => {
      if (iPart.startsWith("*") && iPart.endsWith("*") && iPart.length > 2) {
        return (
          <em key={`i-${baseKey}-${bIdx}-${iIdx}`} className="italic text-foreground/90">
            {iPart.slice(1, -1)}
          </em>
        )
      }
      return iPart
    })
  })
}
