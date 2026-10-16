import type { PGlite } from "@electric-sql/pglite"
import { readSupabaseFile } from "./test-db"

/** Helper bersama test pre-flight upgrade (`supabase/preflight/upgrade-v2.sql`). */

export const PREFLIGHT_SQL = readSupabaseFile("preflight/upgrade-v2.sql")
const STATUSES = ["OK", "GAGAL", "PERINGATAN", "INFO"] as const

export type PreflightStatus = (typeof STATUSES)[number]

export interface PreflightRow {
  pemeriksaan: string
  status: PreflightStatus
  jumlah: number | null
  tindakan: string
}

/** Jalankan seluruh berkas pre-flight (seperti SQL Editor) dan kembalikan result set query terakhir. */
export async function runPreflight(db: PGlite): Promise<PreflightRow[]> {
  const results = await db.exec(PREFLIGHT_SQL)
  const last = results.at(-1)
  if (!last) throw new Error("Pre-flight tidak mengembalikan result set.")
  return last.rows.map((row) => {
    const { pemeriksaan, status, jumlah, tindakan } = row as Record<string, unknown>
    if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) {
      throw new Error(`Status pre-flight tidak dikenal: ${String(status)}`)
    }
    return {
      pemeriksaan: String(pemeriksaan),
      status: status as PreflightStatus,
      jumlah: jumlah === null || jumlah === undefined ? null : Number(jumlah),
      tindakan: String(tindakan),
    }
  })
}

/** Satu baris berdasarkan awalan nama pemeriksaan (harus tepat satu). */
export function check(rows: PreflightRow[], prefix: string): PreflightRow {
  const found = rows.filter((row) => row.pemeriksaan.startsWith(prefix))
  if (found.length !== 1) {
    throw new Error(`Diharapkan tepat 1 baris berawalan "${prefix}", ditemukan ${found.length}.`)
  }
  return found[0] as PreflightRow
}

export function withStatus(rows: PreflightRow[], status: PreflightStatus): string[] {
  return rows.filter((row) => row.status === status).map((row) => `${row.pemeriksaan}: ${row.tindakan}`)
}
