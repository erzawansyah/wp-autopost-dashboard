import { WritingEngine } from "../types/engine"
import { QuickEngine } from "./quick"
import { StandardEngine } from "./standard"
import { AgenticEngine } from "./agentic"

class EngineRegistryClass {
  private engines: Map<string, WritingEngine> = new Map()

  constructor() {
    // Daftarkan engine bawaan
    this.register(new QuickEngine())
    this.register(new StandardEngine())
    this.register(new AgenticEngine())
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
    // Fail-safe: jika pengguna atau item antrean lama meminta "agentic",
    // alihkan secara aman ke 'standard' engine karena agentic sedang dinonaktifkan sementara
    if (id === "agentic") {
      console.warn(
        "[EngineRegistry] Engine 'agentic' sedang dinonaktifkan sementara. Mengalihkan eksekusi ke 'standard' engine."
      )
      return this.engines.get("standard")
    }
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
