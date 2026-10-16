import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { DASHBOARD_ROUTE_CRUMBS } from "./breadcrumbs"

const SRC_DIR = path.resolve(import.meta.dirname, "../..")

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(fullPath)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [fullPath] : []
  })
}

/** Baris kode/teks UI (komentar dilewati: boleh memakai nama singkat seperti "menu Lab"). */
function codeLines(): Array<{ where: string; line: string }> {
  return listSourceFiles(SRC_DIR).flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .map((line, index) => ({ where: `${path.relative(SRC_DIR, file)}:${index + 1}`, line }))
      .filter(({ line }) => !/^\s*(\/\/|\/\*|\*|\{\/\*)/.test(line))
  )
}

const sidebarSource = readFileSync(path.join(SRC_DIR, "components/organisms/sidebar-nav.tsx"), "utf8")
const SIDEBAR_TITLES = [...sidebarSource.matchAll(/\{ title: "([^"]+)", href:/g)].map((match) => match[1])
const PAGE_LABELS = Object.values(DASHBOARD_ROUTE_CRUMBS).map((crumb) => crumb.label)
const SETTINGS_PAGE_LABELS = Object.values(DASHBOARD_ROUTE_CRUMBS)
  .filter((crumb) => crumb.parent === "/settings")
  .map((crumb) => crumb.label)

describe("rujukan nama menu di teks src", () => {
  const lines = codeLines()

  it("sidebar & peta breadcrumb terbaca", () => {
    expect(SIDEBAR_TITLES).toEqual(expect.arrayContaining(["Daftar Website", "Antrean", "Tulis Massal", "Pengaturan"]))
    expect(SETTINGS_PAGE_LABELS).toEqual(expect.arrayContaining(["Kunci API & Model AI", "Profil & Preferensi Akun"]))
  })

  it('"menu <Nama>" selalu label sidebar atau judul halaman yang ada (regresi: "menu Situs")', () => {
    const known = new Set([...SIDEBAR_TITLES, ...PAGE_LABELS])
    const unknown = lines.flatMap(({ where, line }) =>
      [...line.matchAll(/\bmenu ((?:[A-Z][\p{L}]*)(?: (?:[A-Z][\p{L}]*|&))*)/gu)]
        .map((match) => match[1])
        .filter((name) => !known.has(name))
        .map((name) => `${where}: menu ${name}`)
    )
    expect(unknown).toEqual([])
  })

  it('"Pengaturan ➔ <Halaman>" menunjuk sub-halaman Pengaturan yang ada; tanpa "Pengaturan Profil"', () => {
    const references = lines.flatMap(({ where, line }) =>
      [...line.matchAll(/Pengaturan ➔ ([^(.]+?)(?=\s*\(|\.|\s+untuk\b)/g)].map((match) => ({ where, label: match[1] }))
    )
    expect(references.length).toBeGreaterThan(0)
    for (const { where, label } of references) expect(SETTINGS_PAGE_LABELS, where).toContain(label)
    expect(lines.filter(({ line }) => line.includes("Pengaturan Profil")).map(({ where }) => where)).toEqual([])
  })
})
