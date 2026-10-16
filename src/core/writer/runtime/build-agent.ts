import { createAgent, type TypedToolStrategy } from "langchain"
import { createDeepAgent, createPatchToolCallsMiddleware, GENERAL_PURPOSE_SUBAGENT, StoreBackend } from "deepagents"
import { InMemoryStore, MemorySaver } from "@langchain/langgraph"
import { StructuredTool } from "@langchain/core/tools"
import type { LlmGateway } from "@/core/shared/llm/gateway"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { AgentMode, AgentLimits } from "../types/profile"
import type { ArticleFields } from "./article-validation"
import { RunRecorder } from "./telemetry"
import { buildGuardMiddlewareStack } from "./guards"
import { resolveSkillsForAgent } from "./resolve-skills"

const READONLY_FS_FALLBACK = "Operation {{operation}} rejected: the agent filesystem is read-only."

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
  /**
   * Keluaran terstruktur naskah (tool `extract-article`, `createArticleSubmission`). Hanya untuk agen utama:
   * subagent Deep mode tetap mengembalikan teks ke agen utama.
   */
  responseFormat: TypedToolStrategy<ArticleFields>
  /** Panggilan model di akhir anggaran yang hanya boleh dipakai menyerahkan/mengoreksi naskah. */
  reservedModelCalls: number
  skills?: string[]
  userId?: string
}

export async function buildWriterAgent(params: BuildAgentParams) {
  const { mode, gateway, tools, systemPrompt, limits, recorder, responseFormat, reservedModelCalls, skills = [], userId } = params
  const model = gateway.agentModel()
  // Fallback model dipasang paling dalam (setelah guard) agar telemetri & batas model call menghitung
  // satu langkah logis meski model cadangan ikut dicoba. Retry transien terjadi di AsyncCaller model.
  const guards = buildGuardMiddlewareStack(limits, recorder, { reservedModelCalls })
  const middleware = [...guards, gateway.modelFallbackMiddleware()]
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

    const skillSources = resolvedSkills.length > 0 ? ["/skills/"] : undefined

    // 3. Bangun DeepAgent dengan virtual StoreBackend di namespace ["filesystem"].
    //    deepagents menggabungkan middleware kustom ke subagent "general-purpose" bawaan dengan
    //    `appendNew: false`, sehingga guard bernama unik (anggaran model, loop guard & kuota tool,
    //    telemetri, fallback model) terbuang dan panggilan subagent lolos tanpa batas. Spec eksplisit
    //    bernama sama menggantikan bawaan: deskripsi/prompt/mode diambil dari GENERAL_PURPOSE_SUBAGENT
    //    (tanpa harness profile untuk ChatOpenRouter), model/tool/skill sama dengan agen utama, dan
    //    instance middleware yang SAMA sehingga kuota & anggaran dibagi per run.
    const agent = await createDeepAgent({
      name: "deep-writer-agent",
      model,
      tools,
      systemPrompt,
      middleware,
      subagents: [{ ...GENERAL_PURPOSE_SUBAGENT, model, tools, skills: skillSources, middleware }],
      backend: (config) => new ReadOnlyStoreBackend(config, { namespace: ["filesystem"] }),
      store,
      skills: skillSources,
      responseFormat,
      checkpointer,
    })

    return agent
  }

  // Standard Agent Mode (createAgent). Penambal tool call menggantung (bawaan deepagents, sudah terpasang di Deep
  // mode): penyerahan naskah tidak valid yang tercampur tool call riset di satu giliran tidak membuat tool call
  // riset tanpa ToolMessage (ditolak sebagian provider dengan HTTP 400).
  const standardMiddleware = [...guards, createPatchToolCallsMiddleware(), gateway.modelFallbackMiddleware()]
  const agent = createAgent({
    model,
    tools,
    systemPrompt,
    middleware: standardMiddleware,
    responseFormat,
    checkpointer,
  })

  return agent
}
