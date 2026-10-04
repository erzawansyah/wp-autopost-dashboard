import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

export interface DocItem {
  slug: string
  filename: string
  title: string
  content: string
  updatedAt: string
}

function extractTitleFromMarkdown(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  if (match && match[1]) {
    return match[1].trim()
  }
  return fallback
    .replace(/^\d+-/, "")
    .replace(/\.md$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function GET() {
  try {
    const docsDir = path.join(process.cwd(), "docs")
    if (!fs.existsSync(docsDir)) {
      return NextResponse.json({ docs: [] })
    }

    const files = fs.readdirSync(docsDir).filter((file) => file.endsWith(".md"))

    // Urutkan file berdasarkan nama file (misal 01-, 02-, dsb)
    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))

    const docs: DocItem[] = []

    for (const filename of files) {
      const fullPath = path.join(docsDir, filename)
      try {
        const stats = fs.statSync(fullPath)
        const content = fs.readFileSync(fullPath, "utf-8")
        const slug = filename.replace(/\.md$/, "")
        const title = extractTitleFromMarkdown(content, filename)

        docs.push({
          slug,
          filename,
          title,
          content,
          updatedAt: stats.mtime.toISOString(),
        })
      } catch (err) {
        console.warn(`[api/docs] Gagal membaca berkas ${filename}:`, err)
      }
    }

    return NextResponse.json({ docs })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat dokumen"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
