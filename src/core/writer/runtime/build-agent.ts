import { createAgent } from "langchain"
import { createDeepAgent, StoreBackend } from "deepagents"
import { InMemoryStore, MemorySaver } from "@langchain/langgraph"
import { StructuredTool } from "@langchain/core/tools"
import type { LlmGateway } from "@/core/shared/llm/gateway"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { AgentMode, AgentLimits } from "../types/profile"
import { RunRecorder } from "./telemetry"
import { buildGuardMiddlewareStack } from "./guards"
import { resolveSkillsForAgent } from "./resolve-skills"

const READONLY_FS_FALLBACK = "Operasi {{operation}} ditolak: filesystem agen bersifat read-only."

/** Pesan penolakan operasi berkas (`system-readonly-filesystem.md`) yang dikembalikan ke agen. */
function readOnlyFilesystemError(operation: string): { error: string } {
  return {
    error: renderPrompt(loadPrompt("system-readonly-filesystem.md", READONLY_FS_FALLBACK, "system"), { operation }),
  }
}

/**
 * Backend Store Read-Only untuk Skills DeepAgent:
 * Membaca file SKILL.md dari virtual namespace ["filesystem"] (InMemoryStore),
 * sekaligus memproteksi dari operasi penulisan (write/edit/delete).
 */
class ReadOnlyStoreBackend extends StoreBackend {
  async write() {
    return readOnlyFilesystemError("write_file")
  }
  async edit() {
    return readOnlyFilesystemError("edit_file")
  }
  async delete() {
    return readOnlyFilesystemError("delete")
  }
}

export interface BuildAgentParams {
  mode: AgentMode
  /** Gateway LLM run: model utama + middleware fallback model. */
  gateway: LlmGateway
  tools: StructuredTool[]
  systemPrompt: string
  limits: AgentLimits
  recorder: RunRecorder
  skills?: string[]
  userId?: string
}

export async function buildWriterAgent(params: BuildAgentParams) {
  const { mode, gateway, tools, systemPrompt, limits, recorder, skills = [], userId } = params
  const model = gateway.agentModel()
  // Fallback model dipasang paling dalam (setelah guard) agar telemetri & batas model call menghitung
  // satu langkah logis meski model cadangan ikut dicoba. Retry transien terjadi di AsyncCaller model.
  const middleware = [...buildGuardMiddlewareStack(limits, recorder), gateway.modelFallbackMiddleware()]
  const checkpointer = new MemorySaver()

  if (mode === "deep") {
    // 1. Resolusi skill secara dinamis dari database Supabase agent_skills (skill sistem + milik pengguna)
    const resolvedSkills = await resolveSkillsForAgent({
      requestedSlugs: skills,
      userId,
    })

    const store = new InMemoryStore()
    const nowIso = new Date().toISOString()

    // 2. Masukkan setiap skill yang ter-resolve ke dalam InMemoryStore di namespace ["filesystem"]
    for (const s of resolvedSkills) {
      await store.put(
        ["filesystem"],
        `/skills/${s.slug}/SKILL.md`,
        {
          content: s.content,
          created_at: nowIso,
          modified_at: nowIso,
        }
      )
    }

    if (resolvedSkills.length > 0) {
      recorder.recordEvent({
        kind: "guard",
        status: "ok",
        durationMs: 1,
        summary: `Skills System aktif (${resolvedSkills.length} skill dinamis terpasang: ${resolvedSkills.map((s) => s.slug).join(", ")})`,
      })
    }

    // 3. Bangun DeepAgent dengan virtual StoreBackend di namespace ["filesystem"]
    const agent = await createDeepAgent({
      name: "deep-writer-agent",
      model,
      tools,
      systemPrompt,
      middleware,
      backend: (config) => new ReadOnlyStoreBackend(config, { namespace: ["filesystem"] }),
      store,
      skills: resolvedSkills.length > 0 ? ["/skills/"] : undefined,
      checkpointer,
    })

    return agent
  }

  // Standard Agent Mode (createAgent)
  const agent = createAgent({
    model,
    tools,
    systemPrompt,
    middleware,
    checkpointer,
  })

  return agent
}
