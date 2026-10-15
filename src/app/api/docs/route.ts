import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { defineRoute } from "@/server/http/route"

interface DocItem {
  slug: string
  filename: string
  title: string
  content: string
  updatedAt: string
}

/**
 * Panduan pengguna untuk reader in-app `/docs`: hanya `docs/guides/0N-<slug>.md`.
 * Dokumen internal developer tetap di `docs/` (di luar folder ini) sehingga tidak disajikan
 * dan tidak ikut ter-trace ke image standalone.
 */
const USER_GUIDE_FILENAME = /^0\d-[a-z0-9-]+\.md$/

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

async function readGuide(docsDir: string, filename: string): Promise<DocItem | null> {
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
    console.warn(`[api/docs] Gagal membaca berkas panduan ${filename}.`)
    return null
  }
}

// GET /api/docs — panduan pengguna (docs/guides/0N-*.md) untuk reader in-app; tanpa dokumen internal
export const GET = defineRoute({ auth: "none" }, async () => {
  const docsDir = path.join(process.cwd(), "docs", "guides")
  const filenames = await listUserGuideFiles(docsDir)
  const docs = (await Promise.all(filenames.map((filename) => readGuide(docsDir, filename)))).filter(
    (doc): doc is DocItem => doc !== null
  )
  return { docs }
})
