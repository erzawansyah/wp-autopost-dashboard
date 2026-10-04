import path from "path"
import fs from "fs"
import { createAgent } from "langchain"
import { createDeepAgent, StateBackend } from "deepagents"
import { MemorySaver } from "@langchain/langgraph"
import { StructuredTool } from "@langchain/core/tools"
import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { AgentMode, AgentLimits } from "../types/profile"
import { RunRecorder } from "./telemetry"
import { buildGuardMiddlewareStack } from "./guards"

export interface BuildAgentParams {
  mode: AgentMode
  model: BaseChatModel
  tools: StructuredTool[]
  systemPrompt: string
  limits: AgentLimits
  recorder: RunRecorder
  skills?: string[]
}

export async function buildWriterAgent(params: BuildAgentParams) {
  const { mode, model, tools, systemPrompt, limits, recorder, skills = [] } = params
  const middleware = buildGuardMiddlewareStack(limits, recorder)
  const checkpointer = new MemorySaver()

  if (mode === "deep") {
    // Kumpulkan path direktori skill yang valid
    const curatedSkills: string[] = []
    const requestedSkills = skills.length > 0 ? skills : ["anti-ai-editor"]

    for (const skillSlug of requestedSkills) {
      // 1. Cek di .agents/skills/<slug>
      const systemPath = path.join(process.cwd(), ".agents", "skills", skillSlug)
      if (fs.existsSync(path.join(systemPath, "SKILL.md"))) {
        curatedSkills.push(systemPath)
        continue
      }

      // 2. Cek di .workspaces/skills/<slug>
      const userPath = path.join(process.cwd(), ".workspaces", "skills", skillSlug)
      if (fs.existsSync(path.join(userPath, "SKILL.md"))) {
        curatedSkills.push(userPath)
        continue
      }
    }

    const agent = await createDeepAgent({
      name: "deep-writer-agent",
      model,
      tools,
      systemPrompt,
      middleware,
      backend: (cfg) => new StateBackend(cfg),
      skills: curatedSkills.length > 0 ? curatedSkills : undefined,
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
