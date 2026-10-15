/**
 * Helper `searchParams` halaman App Router (RSC). Next memberi `string` untuk `?a=1`, `string[]` untuk parameter
 * berulang (`?a=1&a=2`), dan `undefined` bila tidak ada — halaman hanya memakai nilai pertama.
 */
export type SearchParamValue = string | string[] | undefined

/** Nilai pertama parameter query (`?tab=a&tab=b` → `"a"`); tidak ada → `undefined`. */
export function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
