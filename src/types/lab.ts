import type { ToolInputField } from "@/core/writer/tools/registry"

/**
 * Tipe Laboratorium (Developer Mode) di batas API `/api/lab/**` — dipakai service server dan client.
 * Respons `POST /api/lab/run` ditangani `src/components/organisms/lab/lab-run.ts`.
 */

/** Situs WordPress milik pengguna sebagai target uji (tanpa kredensial). */
export interface LabSiteOption {
  id: string
  site_name: string
  base_url: string
  wp_username: string
  status: string
}

/** Manifest satu tool yang dapat diuji (ToolRegistry + publisher khusus Lab). */
export interface LabToolManifest {
  id: string
  name: string
  description: string
  requiresSite: boolean
  defaultParams: Record<string, unknown>
  inputFields: ToolInputField[]
}

/** Agent Profile (bawaan `preset:*` atau kustom) yang dapat diuji, beserta contoh input awal. */
export interface LabProfileManifest {
  id: string
  name: string
  description: string
  mode: string
  toolCount: number
  isPreset: boolean
  defaultRequest: { keyword: string; brief: string }
}

/** Respons `GET /api/lab/registry` (tanpa `ok`). */
export interface LabRegistry {
  sites: LabSiteOption[]
  tools: LabToolManifest[]
  profiles: LabProfileManifest[]
}
