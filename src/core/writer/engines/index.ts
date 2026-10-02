import { WritingEngine } from "../types/engine"
import { QuickEngine } from "./quick"
import { StandardEngine } from "./standard"
import { AgenticEngine } from "./agentic"
import { DeepAgentEngine } from "./deepagent"

class EngineRegistryClass {
  private engines: Map<string, WritingEngine> = new Map()

  constructor() {
    // Daftarkan engine bawaan
    this.register(new QuickEngine())
    this.register(new StandardEngine())
    this.register(new AgenticEngine())
    this.register(new DeepAgentEngine())
  }

  /**
   * Mendaftarkan instance engine baru ke dalam sistem
   */
  register(engine: WritingEngine): void {
    if (this.engines.has(engine.id)) {
      console.warn(`[EngineRegistry] Engine "${engine.id}" telah terdaftar sebelumnya. Mengganti dengan implementasi baru.`)
    }
    this.engines.set(engine.id, engine)
  }

  /**
   * Mengambil engine berdasarkan id
   */
  get(id: string): WritingEngine | undefined {
    return this.engines.get(id)
  }

  /**
   * Menampilkan daftar semua engine yang terdaftar untuk ditampilkan di antarmuka UI
   */
  list(): Array<{
    id: string
    name: string
    description: string
    version: string
    capabilities: WritingEngine["capabilities"]
  }> {
    return Array.from(this.engines.values()).map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      version: e.version,
      capabilities: e.capabilities,
    }))
  }
}

export const EngineRegistry = new EngineRegistryClass()
