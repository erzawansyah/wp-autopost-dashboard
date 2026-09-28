import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import * as fs from "fs"
import * as path from "path"

function maskKey(key: string | undefined): string | null {
  if (!key || typeof key !== "string" || key.trim() === "") return null
  const trimmed = key.trim()
  if (trimmed.length <= 8) return "********"
  const prefix = trimmed.slice(0, 4)
  const suffix = trimmed.slice(-4)
  return `${prefix}${"*".repeat(Math.max(4, trimmed.length - 8))}${suffix}`
}

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  const content = fs.readFileSync(filePath, "utf-8")
  const lines = content.split(/\r?\n/)
  const result: Record<string, string> = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim()
      let v = trimmed.slice(eqIdx + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      result[k] = v
    }
  }
  return result
}

function writeEnvLocal(updates: Record<string, string | null>) {
  const cwd = process.cwd()
  const envLocalPath = path.join(cwd, ".env.local")
  let content = ""
  if (fs.existsSync(envLocalPath)) {
    content = fs.readFileSync(envLocalPath, "utf-8")
  }

  const lines = content ? content.split(/\r?\n/) : []
  const updatedKeys = new Set<string>()

  // Update baris yang sudah ada
  const newLines = lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) return line
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim()
      if (k in updates) {
        updatedKeys.add(k)
        const val = updates[k]
        if (val === null || val === "") {
          return "" // hapus atau kosongkan
        }
        return `${k}="${val}"`
      }
    }
    return line
  }).filter((line) => line !== "")

  // Tambahkan baris baru untuk kunci yang belum ada
  for (const [k, val] of Object.entries(updates)) {
    if (!updatedKeys.has(k) && val !== null && val !== "") {
      newLines.push(`${k}="${val}"`)
    }
  }

  fs.writeFileSync(envLocalPath, newLines.join("\n") + "\n", "utf-8")

  // Update process.env runtime
  for (const [k, val] of Object.entries(updates)) {
    if (val === null || val === "") {
      delete process.env[k]
    } else {
      process.env[k] = val
    }
  }
}

function resolveCurrentKey(keyName: string): string | undefined {
  if (process.env[keyName]) return process.env[keyName]
  const cwd = process.cwd()
  const localEnv = readEnvFile(path.join(cwd, ".env.local"))
  if (localEnv[keyName]) return localEnv[keyName]
  const baseEnv = readEnvFile(path.join(cwd, ".env"))
  return baseEnv[keyName]
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const tavilyKey = resolveCurrentKey("TAVILY_API_KEY")
    const braveKey = resolveCurrentKey("BRAVE_API_KEY")
    const defaultProvider = resolveCurrentKey("DEFAULT_SEARCH_PROVIDER") || "auto"

    return NextResponse.json({
      ok: true,
      providers: {
        tavily: {
          configured: Boolean(tavilyKey && tavilyKey.trim().length > 0),
          maskedKey: maskKey(tavilyKey),
        },
        brave: {
          configured: Boolean(braveKey && braveKey.trim().length > 0),
          maskedKey: maskKey(braveKey),
        },
      },
      defaultProvider,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { tavilyApiKey, braveApiKey, defaultProvider } = body

    const updates: Record<string, string | null> = {}

    if (typeof tavilyApiKey === "string") {
      const trimmed = tavilyApiKey.trim()
      if (trimmed === "") {
        updates["TAVILY_API_KEY"] = null
      } else if (!trimmed.includes("*")) {
        updates["TAVILY_API_KEY"] = trimmed
      }
    }

    if (typeof braveApiKey === "string") {
      const trimmed = braveApiKey.trim()
      if (trimmed === "") {
        updates["BRAVE_API_KEY"] = null
      } else if (!trimmed.includes("*")) {
        updates["BRAVE_API_KEY"] = trimmed
      }
    }

    if (typeof defaultProvider === "string" && defaultProvider.trim()) {
      const valid = ["auto", "tavily", "brave", "bing_scraper", "open_knowledge"]
      if (valid.includes(defaultProvider.trim())) {
        updates["DEFAULT_SEARCH_PROVIDER"] = defaultProvider.trim()
      }
    }

    if (Object.keys(updates).length > 0) {
      writeEnvLocal(updates)
    }

    return NextResponse.json({
      ok: true,
      message: "Pengaturan mesin pencari berhasil disimpan.",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
