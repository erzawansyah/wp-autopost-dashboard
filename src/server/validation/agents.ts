import { z } from "zod"
import { ToolRegistry } from "@/core/writer/tools"
import { UuidSchema } from "@/lib/validation/common"
import {
  CreateAgentProfileBodyBaseSchema,
  NO_AGENT_PROFILE_CHANGES_MESSAGE,
  UpdateAgentProfileBodyBaseSchema,
  agentToolIdsSchema,
  hasAgentProfileChanges,
} from "@/lib/validation/agents"

/**
 * Skema KHUSUS server untuk route Agent Profile: bentuk body ada di `@/lib/validation/agents` (dipakai
 * bersama editor client); di sini hanya pemeriksaan `toolIds` terhadap ToolRegistry (modul server).
 * Rentang batas eksekusi tetap lewat `clampLimits()` di service.
 */

/** Hanya tool yang terdaftar di ToolRegistry; duplikat dibuang. */
const RegisteredToolIdsSchema = agentToolIdsSchema(
  z.string({ error: "ID tool harus berupa teks." }).trim().refine((id) => ToolRegistry.has(id), {
    message: "Tool tidak dikenal. Pilih tool dari daftar yang tersedia.",
  })
)

/** POST /api/agents. */
export const CreateAgentProfileBodySchema = CreateAgentProfileBodyBaseSchema.extend({
  toolIds: RegisteredToolIdsSchema.default([]),
})

export type CreateAgentProfileInput = z.infer<typeof CreateAgentProfileBodySchema>

/** PUT /api/agents/[id]: pembaruan parsial (lihat `UpdateAgentProfileBodyBaseSchema`). */
export const UpdateAgentProfileBodySchema = UpdateAgentProfileBodyBaseSchema.extend({
  toolIds: RegisteredToolIdsSchema.optional(),
}).refine(hasAgentProfileChanges, { message: NO_AGENT_PROFILE_CHANGES_MESSAGE })

export type UpdateAgentProfileInput = z.infer<typeof UpdateAgentProfileBodySchema>

/** GET /api/agents/tools. */
export const AgentToolsQuerySchema = z.object({
  siteId: UuidSchema.optional(),
})
