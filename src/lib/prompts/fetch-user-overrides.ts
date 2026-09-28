/**
 * fetch-user-overrides.ts
 * Helper server-side untuk membaca override prompt user dari tabel `prompt_templates` di Supabase.
 *
 * Output-nya kompatibel langsung dengan `mergeEnginePromptOverrides()` dari engine-prompt-loader.
 *
 * Prasyarat:
 *   - Tabel `prompt_templates` sudah ada (jalankan migrate-prompt-templates.js)
 *   - `template_id` mengikuti format: "engineId/nodeId" (contoh: "quick/article_drafter")
 *
 * Keamanan:
 *   - Fungsi ini hanya boleh dipanggil dari Server Action / Route Handler / Worker (server-side).
 *   - Tidak pernah mengembalikan data ke browser secara langsung.
 */

import { SupabaseClient } from "@supabase/supabase-js"

/** Bentuk override per-node yang kompatibel dengan mergeEnginePromptOverrides() */
export interface NodePromptOverride {
  systemPrompt?: string
  userPrompt?: string
}

/** Peta override: key = nodeId (bukan engineId/nodeId, sudah di-strip prefix engine) */
export type EnginePromptOverrideMap = Record<string, NodePromptOverride>

/**
 * Mengambil semua override prompt user untuk engine tertentu dari Supabase.
 *
 * @param supabase - Supabase client yang sudah terotentikasi (server-side)
 * @param userId   - UUID user pemilik override
 * @param engineId - ID engine, e.g. "quick" atau "standard"
 * @returns Peta override per-nodeId (kosong jika tidak ada override)
 */
export async function fetchUserPromptOverrides(
  supabase: SupabaseClient,
  userId: string,
  engineId: string
): Promise<EnginePromptOverrideMap> {
  try {
    // Prefix yang digunakan saat menyimpan override: "engineId/nodeId"
    const prefix = `${engineId}/`

    const { data, error } = await supabase
      .from("prompt_templates")
      .select("template_id, system_prompt, user_prompt_template")
      .eq("user_id", userId)
      .like("template_id", `${prefix}%`)

    if (error) {
      console.warn(
        `[fetchUserPromptOverrides] Gagal mengambil override prompt (engine: ${engineId}, user: ${userId}):`,
        error.message
      )
      return {}
    }

    if (!data || data.length === 0) {
      return {}
    }

    // Susun peta override: strip prefix "engineId/" untuk mendapatkan nodeId murni
    const overrideMap: EnginePromptOverrideMap = {}
    for (const row of data) {
      const nodeId = row.template_id.startsWith(prefix)
        ? row.template_id.slice(prefix.length)
        : row.template_id

      overrideMap[nodeId] = {
        systemPrompt: row.system_prompt || undefined,
        userPrompt: row.user_prompt_template || undefined,
      }
    }

    return overrideMap
  } catch (err) {
    console.warn(
      `[fetchUserPromptOverrides] Kesalahan runtime saat membaca override prompt:`,
      err
    )
    // Fail-safe: kembalikan peta kosong agar proses generate tetap berjalan dengan prompt default
    return {}
  }
}
