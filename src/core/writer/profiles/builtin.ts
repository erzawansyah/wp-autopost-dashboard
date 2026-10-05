import {
  AgentProfile,
  DEFAULT_STANDARD_LIMITS,
  DEFAULT_DEEP_LIMITS,
  MANDATORY_TOOL_IDS,
} from "../types/profile"
import { loadPrompt } from "@/core/shared/prompts/loader"

export const LEGACY_ENGINE_MAP: Record<string, string> = {
  quick: "preset:quick-writer",
  standard: "preset:research-writer",
  agentic: "preset:research-writer",
  deepagent: "preset:deep-research",
}

export function loadPromptFile(filename: string, fallbackDesc = ""): string {
  return loadPrompt(filename, fallbackDesc)
}

export function getBuiltinPrompts() {
  return {
    quick: loadPromptFile("agent-quick-writer.md", "Penulis Konten Cepat 1-Shot."),
    research: loadPromptFile("agent-research-writer.md", "Jurnalis Investigatif & Kurator Konten."),
    deep: loadPromptFile("agent-deep-research.md", "Senior Investigative Reporter Deep Agent."),
  }
}

export const getPresetPrompts = getBuiltinPrompts

export const BUILTIN_AGENT_PROFILES: AgentProfile[] = [
  {
    ref: "preset:quick-writer",
    name: "Quick Writer",
    description:
      "Generasi cepat mandiri tanpa tools eksternal. Hemat token, efisien, dan cocok untuk topik umum atau artikel instan.",
    mode: "standard",
    temperature: 0.95,
    get workflowPrompt() {
      return loadPromptFile("agent-quick-writer.md", "Penulis Konten Cepat 1-Shot.")
    },
    toolIds: [...MANDATORY_TOOL_IDS],
    limits: {
      ...DEFAULT_STANDARD_LIMITS,
      maxToolCalls: 4,
      maxModelCalls: 5,
      timeoutSeconds: 90,
      minWordCount: 600,
    },
    isPreset: true,
    isDefault: true,
    version: 1,
  },
  {
    ref: "preset:research-writer",
    name: "Research & Media Writer",
    description:
      "Agent otonom bertenaga pencarian web live, pembaca URL, kurasi foto bebas royalti, dan integrasi WordPress Media Library.",
    mode: "standard",
    temperature: 0.95,
    get workflowPrompt() {
      return loadPromptFile("agent-research-writer.md", "Jurnalis Investigatif & Kurator Konten.")
    },
    toolIds: [
      "keyword_suggestions",
      "web_search",
      "web_reader",
      "image_search",
      "set_featured_image",
      "upload_media",
    ],
    limits: DEFAULT_STANDARD_LIMITS,
    isPreset: true,
    version: 1,
  },
  {
    ref: "preset:deep-research",
    name: "Deep Research Specialist",
    description:
      "Deep Agent investigatif dengan task planning internal, penalaran bertahap, dan penerapan prinsip humanisasi naskah.",
    mode: "deep",
    temperature: 0.95,
    get workflowPrompt() {
      return loadPromptFile("agent-deep-research.md", "Senior Investigative Reporter Deep Agent.")
    },
    toolIds: [
      "keyword_suggestions",
      "web_search",
      "web_reader",
      "image_search",
      "set_featured_image",
      "upload_media",
    ],
    skills: ["anti-ai-editor"],
    limits: DEFAULT_DEEP_LIMITS,
    isPreset: true,
    version: 1,
  },
]

/** Alias backward-compatibility */
export const BUILTIN_PRESETS = BUILTIN_AGENT_PROFILES

export function getBuiltinProfiles(): AgentProfile[] {
  return [...BUILTIN_AGENT_PROFILES]
}

export const getBuiltinPresets = getBuiltinProfiles

export function getBuiltinProfile(refOrId: string): AgentProfile | undefined {
  const normalized = refOrId.startsWith("preset:")
    ? refOrId
    : refOrId.startsWith("agent:")
      ? refOrId.replace("agent:", "preset:")
      : `preset:${refOrId}`
  return BUILTIN_AGENT_PROFILES.find((p) => p.ref === normalized || p.ref === refOrId)
}

export const getBuiltinPreset = getBuiltinProfile

/**
 * Memetakan identifier engine lama (quick, standard, agentic, deepagent) ke profile agent baru
 */
export function resolveLegacyEngineToProfile(engineId?: string): string {
  if (!engineId) return "preset:quick-writer"
  if (engineId.startsWith("preset:") || engineId.startsWith("agent:") || engineId.length > 20) {
    return engineId
  }
  return LEGACY_ENGINE_MAP[engineId] || "preset:quick-writer"
}

export const resolveLegacyEngineToPreset = resolveLegacyEngineToProfile
