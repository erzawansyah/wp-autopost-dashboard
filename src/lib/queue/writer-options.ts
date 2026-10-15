/**
 * Opsi form penulis (Tulis Cepat / Tulis Massal / Tulis Terstruktur) yang disiapkan page RSC lalu dioper ke
 * organism client — modul murni (aman diimpor server & client).
 */

/** Opsi pemilih Agent Profile (ringkas; tanpa workflow prompt/batas yang tidak perlu dikirim ke browser). */
export interface AgentProfileOption {
  ref: string
  name: string
  description: string
  mode: "standard" | "deep"
  toolCount: number
  isPreset: boolean
}

interface AgentProfileSource {
  ref: string
  name: string
  description?: string
  mode: string
  toolIds?: string[]
}

/** Profil bawaan default form (dipakai worker juga bila `agentProfileRef` kosong). */
export const DEFAULT_AGENT_PROFILE_REF = "preset:quick-writer"

/** Hasil `listAgentProfiles` → opsi pemilih (preset dulu, lalu profil kustom). */
export function toAgentProfileOptions(profiles: {
  presets: AgentProfileSource[]
  userProfiles: AgentProfileSource[]
}): AgentProfileOption[] {
  const toOption = (profile: AgentProfileSource, isPreset: boolean): AgentProfileOption => ({
    ref: profile.ref,
    name: profile.name,
    description: profile.description ?? "",
    mode: profile.mode === "deep" ? "deep" : "standard",
    toolCount: profile.toolIds?.length ?? 0,
    isPreset,
  })
  return [
    ...profiles.presets.map((profile) => toOption(profile, true)),
    ...profiles.userProfiles.map((profile) => toOption(profile, false)),
  ]
}

/** `Date` → nilai input `datetime-local` (zona waktu browser), mis. `2026-10-15T09:30`. */
export function toLocalDateTimeInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

/** Default rentang jadwal: mulai sekarang, berakhir 7 hari lagi. */
export function defaultScheduleWindow(now: Date = new Date()): { start: string; end: string } {
  return {
    start: toLocalDateTimeInput(now),
    end: toLocalDateTimeInput(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
  }
}
