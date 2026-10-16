import { selectModelId } from "@/core/shared/llm/gateway"
import type { AgentProfile } from "../types/profile"

/**
 * Prioritas model penulisan artikel — satu sumber untuk worker antrean (model yang dicatat & dikirim ke writer) dan
 * `runAgentWriter` (kandidat gateway LLM, dipakai juga Lab):
 * 1. model eksplisit per permintaan (field `aiModel` API antrean / `model` API Lab);
 * 2. model yang dipilih eksplisit pada Agent Profile kustom;
 * 3. Model Default Penulisan Artikel akun (Pengaturan › Kunci API & Model AI) — berlaku juga untuk preset bawaan;
 * 4. model bawaan preset (bila suatu saat diisi): tidak pernah mengalahkan default akun;
 * 5. env `OPENROUTER_DEFAULT_MODEL` → `DEFAULT_AI_MODEL` (`selectModelId`).
 * `getUserDecryptedKeys` sudah mengisi default akun dengan env `OPENROUTER_DEFAULT_MODEL` bila pengguna belum memilih.
 */
export interface WriterModelSources {
  requestModel?: string | null
  profile: Pick<AgentProfile, "model" | "isPreset">
  userDefaultModel?: string | null
}

/** Kandidat model urut prioritas (kosong dibuang); gateway memakai kandidat pertama. */
export function writerModelCandidates({ requestModel, profile, userDefaultModel }: WriterModelSources): string[] {
  const ordered = profile.isPreset
    ? [requestModel, userDefaultModel, profile.model]
    : [requestModel, profile.model, userDefaultModel]
  return ordered.map((model) => model?.trim() ?? "").filter((model) => model.length > 0)
}

/** Model yang akan dipakai run: kandidat pertama, lalu env `OPENROUTER_DEFAULT_MODEL`, lalu `DEFAULT_AI_MODEL`. */
export function resolveWriterModel(sources: WriterModelSources): string {
  return selectModelId(writerModelCandidates(sources))
}
