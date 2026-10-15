import { DecryptedUserKeys } from "@/types/settings"
import { ToolRegistry, ToolRequirement } from "./registry"

export interface BlockedToolInfo {
  id: string
  label: string
  missingRequirements: string[]
  reason: string
}

export interface EligibilityResult {
  /** ID tools yang memenuhi semua syarat teknis dan siap dipakai */
  eligibleToolIds: string[]
  /** Tools yang tidak dapat dipakai karena syarat belum terpenuhi (kunci API / website belum terhubung) */
  blockedTools: BlockedToolInfo[]
}

/**
 * Memeriksa apakah sebuah requirement terpenuhi
 */
function isRequirementMet(
  req: ToolRequirement,
  userKeys?: DecryptedUserKeys,
  wpCredentials?: { baseUrl?: string; applicationPassword?: string }
): { met: boolean; missingLabel?: string } {
  if (req.type === "wp_site") {
    const hasSite = Boolean(wpCredentials?.baseUrl && wpCredentials?.applicationPassword)
    return {
      met: hasSite,
      missingLabel: hasSite ? undefined : req.label || "Koneksi WordPress aktif",
    }
  }

  if (req.type === "api_key") {
    const val = userKeys ? userKeys[req.key] : undefined
    const hasKey = typeof val === "string" && val.trim().length > 0
    return {
      met: hasKey,
      missingLabel: hasKey ? undefined : req.label || `API Key untuk ${String(req.key)}`,
    }
  }

  if (req.type === "any_api_key") {
    const hasAny = req.keys.some((k) => {
      const val = userKeys ? userKeys[k] : undefined
      return typeof val === "string" && val.trim().length > 0
    })
    return {
      met: hasAny,
      missingLabel: hasAny ? undefined : req.label || "Salah satu API Key yang diperlukan",
    }
  }

  return { met: true }
}

/**
 * Mengevaluasi daftar tool IDs terhadap kredensial user dan situs WordPress aktif
 */
export function checkToolEligibility(
  toolIds: string[],
  userKeys?: DecryptedUserKeys,
  wpCredentials?: { baseUrl?: string; applicationPassword?: string }
): EligibilityResult {
  const eligibleToolIds: string[] = []
  const blockedTools: BlockedToolInfo[] = []

  for (const id of toolIds) {
    const toolDef = ToolRegistry.get(id)
    if (!toolDef) {
      blockedTools.push({
        id,
        label: id,
        missingRequirements: ["Tool tidak terdaftar dalam sistem"],
        reason: `Tool "${id}" tidak ditemukan di ToolRegistry`,
      })
      continue
    }

    const missing: string[] = []
    for (const req of toolDef.requirements) {
      const check = isRequirementMet(req, userKeys, wpCredentials)
      if (!check.met && check.missingLabel) {
        missing.push(check.missingLabel)
      }
    }

    if (missing.length > 0) {
      blockedTools.push({
        id: toolDef.id,
        label: toolDef.label,
        missingRequirements: missing,
        reason: `Memerlukan: ${missing.join(", ")}`,
      })
    } else {
      eligibleToolIds.push(toolDef.id)
    }
  }

  return { eligibleToolIds, blockedTools }
}
