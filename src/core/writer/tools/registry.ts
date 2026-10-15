import { StructuredTool } from "@langchain/core/tools"
import { DecryptedUserKeys } from "@/types/settings"
import { RunRecorder } from "../runtime/telemetry"
import type { ToolArtifact } from "./tool-response"

export type ToolRequirement =
  | { type: "wp_site"; label: string }
  | { type: "api_key"; key: keyof DecryptedUserKeys; label: string }
  | { type: "any_api_key"; keys: (keyof DecryptedUserKeys)[]; label: string }

export interface ToolRuntimeContext {
  userKeys: DecryptedUserKeys
  wpCredentials?: {
    baseUrl: string
    username: string
    applicationPassword: string
  }
  language: string
  recorder: RunRecorder
  /**
   * Sinyal pembatalan run (timeout/abort agen). Digabung dengan `config.signal` LangChain dan
   * diteruskan ke setiap fetch tool sehingga request yang sedang berjalan ikut dibatalkan.
   */
  signal?: AbortSignal
}

export interface ToolInputField {
  name: string
  label: string
  type: "text" | "number" | "select" | "textarea"
  description?: string
  defaultValue?: string | number | boolean
  placeholder?: string
  options?: { value: string; label: string }[]
}

export interface ToolDefinition {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly category: "research" | "media" | "wordpress"
  readonly requirements: ToolRequirement[]
  readonly defaultLimit: number
  /** Deklarasi kolom input form pengujian lab & runtime UI */
  readonly inputFields?: ToolInputField[]
  /**
   * Membangun instance LangChain StructuredTool (`responseFormat: "content_and_artifact"`) yang siap
   * diinjeksi ke agent: konten teks untuk LLM + artifact `ToolOutcome` untuk guard/telemetri.
   */
  build(ctx: ToolRuntimeContext): StructuredTool
  /**
   * Ringkasan padat satu baris dari artifact `ToolOutcome` untuk telemetri log (maks 240 karakter).
   * Data sukses dibaca lewat schema zod keluaran tool di berkas definisinya (`summarizeToolOutcome`).
   */
  summarize(outcome: ToolArtifact): string
}

class ToolRegistryImpl {
  private tools = new Map<string, ToolDefinition>()

  public register(toolDef: ToolDefinition): void {
    this.tools.set(toolDef.id, toolDef)
  }

  public get(id: string): ToolDefinition | undefined {
    return this.tools.get(id)
  }

  public list(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  public getAll(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  public has(id: string): boolean {
    return this.tools.has(id)
  }
}

export const ToolRegistry = new ToolRegistryImpl()
