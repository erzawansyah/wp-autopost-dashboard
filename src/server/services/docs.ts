import "server-only"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import type { UserGuide } from "@/types/docs"

/**
 * Panduan pengguna untuk reader in-app `/docs` (dibaca langsung oleh RSC): hanya `docs/guides/0N-<slug>.md`.
 * Dokumen internal developer tetap di `docs/` (di luar folder ini) sehingga tidak disajikan dan tidak
 * ikut ter-trace ke image standalone.
 */
const USER_GUIDE_FILENAME = /^0\d-[a-z0-9-]+\.md$/

function guidesDir(): string {
  return path.join(process.cwd(), "docs", "guides")
}

function extractTitleFromMarkdown(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  if (match?.[1]) return match[1].trim()
  return filename
    .replace(/^\d+-/, "")
    .replace(/\.md$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

async function listUserGuideFiles(docsDir: string): Promise<string[]> {
  try {
    const files = await readdir(docsDir)
    return files
      .filter((file) => USER_GUIDE_FILENAME.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
  } catch {
    return []
  }
}

async function readGuide(docsDir: string, filename: string): Promise<UserGuide | null> {
  try {
    const fullPath = path.join(docsDir, filename)
    const [stats, content] = await Promise.all([stat(fullPath), readFile(fullPath, "utf-8")])
    return {
      slug: filename.replace(/\.md$/, ""),
      filename,
      title: extractTitleFromMarkdown(content, filename),
      content,
      updatedAt: stats.mtime.toISOString(),
    }
  } catch {
    console.warn(`[docs] Gagal membaca berkas panduan ${filename}.`)
    return null
  }
}

/** Seluruh panduan pengguna, urut nomor berkas; berkas yang gagal dibaca dilewati. */
export async function listUserGuides(): Promise<UserGuide[]> {
  const docsDir = guidesDir()
  const filenames = await listUserGuideFiles(docsDir)
  const guides = await Promise.all(filenames.map((filename) => readGuide(docsDir, filename)))
  return guides.filter((guide): guide is UserGuide => guide !== null)
}
