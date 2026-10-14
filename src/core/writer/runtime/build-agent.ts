import { createAgent } from "langchain"
import { createDeepAgent, StoreBackend } from "deepagents"
import { InMemoryStore, MemorySaver } from "@langchain/langgraph"
import { StructuredTool } from "@langchain/core/tools"
import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { AgentMode, AgentLimits } from "../types/profile"
import { RunRecorder } from "./telemetry"
import { buildGuardMiddlewareStack } from "./guards"
import { resolveSkillsForAgent } from "./resolve-skills"

/**
 * Backend Store Read-Only untuk Skills DeepAgent:
 * Membaca file SKILL.md dari virtual namespace ["filesystem"] (InMemoryStore),
 * sekaligus memproteksi dari operasi penulisan (write/edit/delete).
 */
class ReadOnlyStoreBackend extends StoreBackend {
  async write() {
    return { error: "PEMBERITAHUAN SISTEM: Tool write_file dinonaktifkan. Anda DILARANG menulis draf ke berkas virtual. Segera sajikan seluruh naskah artikel lengkap dan tuntas langsung sebagai pesan teks respons akhir Anda." }
  }
  async edit() {
    return { error: "PEMBERITAHUAN SISTEM: Tool edit_file dinonaktifkan. Segera sajikan seluruh naskah artikel lengkap dan tuntas langsung sebagai pesan teks respons akhir Anda." }
  }
  async delete() {
    return { error: "Izin ditolak: Deep Writer Agent dilarang menghapus berkas." }
  }
}

export interface BuildAgentParams {
  mode: AgentMode
  model: BaseChatModel
  tools: StructuredTool[]
  systemPrompt: string
  limits: AgentLimits
  recorder: RunRecorder
  skills?: string[]
  userId?: string
}

export async function buildWriterAgent(params: BuildAgentParams) {
  const { mode, model, tools, systemPrompt, limits, recorder, skills = [], userId } = params
  const middleware = buildGuardMiddlewareStack(limits, recorder)
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
