import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { parseEnginePromptsMarkdown } from "@/core/shared/engine-prompt-loader"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"

/** Daftar engine yang dikenali dan node-nya */
const ENGINE_MANIFEST: Record<string, { label: string; nodes: string[] }> = {
  quick: {
    label: "Quick Engine",
    nodes: ["taxonomy_resolver", "article_drafter", "quality_checker"],
  },
  standard: {
    label: "Standard Engine",
    nodes: [
      "taxonomy_resolver",
      "topic_researcher",
      "image_curator",
      "article_drafter",
      "quality_checker",
    ],
  },
  agentic: {
    label: "Agentic Writer",
    nodes: ["taxonomy_resolver", "agentic_writer"],
  },
}

function readDefaultPrompts(engineId: string) {
  const filePath = path.join(
    process.cwd(),
    "src",
    "core",
    "prompts",
    `${engineId}-engine-prompts.md`
  )
  if (!fs.existsSync(filePath)) return {}
  const raw = fs.readFileSync(filePath, "utf-8")
  const parsed = parseEnginePromptsMarkdown(raw)
  // Serialize ke plain object (tanpa fungsi) untuk JSON response
  return Object.fromEntries(
    Object.entries(parsed).map(([nodeId, p]) => [
      nodeId,
      {
        systemPrompt: p.systemPrompt,
        userPrompt: p.userPrompt,
        outputFormat: p.outputFormat || null,
      },
    ])
  )
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Ambil seluruh override yang disimpan user ini di Supabase
    const { data: overrides } = await supabase
      .from("prompt_templates")
      .select("template_id, system_prompt, user_prompt_template, is_default, updated_at")
      .eq("user_id", user.id)

    // Susun map override: key = "engineId/nodeId"
    const overrideMap: Record<
      string,
      { systemPrompt: string; userPrompt: string; updatedAt: string }
    > = {}
    for (const row of overrides || []) {
      overrideMap[row.template_id] = {
        systemPrompt: row.system_prompt,
        userPrompt: row.user_prompt_template,
        updatedAt: row.updated_at,
      }
    }

    // Susun payload per engine
    const engines = Object.entries(ENGINE_MANIFEST).map(([engineId, meta]) => {
      const defaults = readDefaultPrompts(engineId)

      const nodes = meta.nodes.map((nodeId) => {
        const defaultPrompt = defaults[nodeId] || {
          systemPrompt: "",
          userPrompt: "",
          outputFormat: null,
        }
        const overrideKey = `${engineId}/${nodeId}`
        const userOverride = overrideMap[overrideKey]

        return {
          nodeId,
          defaultSystemPrompt: defaultPrompt.systemPrompt,
          defaultUserPrompt: defaultPrompt.userPrompt,
          outputFormat: defaultPrompt.outputFormat,
          isOverridden: !!userOverride,
          override: userOverride
            ? {
                systemPrompt: userOverride.systemPrompt,
                userPrompt: userOverride.userPrompt,
                updatedAt: userOverride.updatedAt,
              }
            : null,
        }
      })

      return {
        engineId,
        label: meta.label,
        nodes,
      }
    })

    return NextResponse.json({ ok: true, engines })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
