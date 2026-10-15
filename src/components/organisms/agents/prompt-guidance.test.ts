import { describe, expect, it } from "vitest"
import { firstErrorMessage } from "@/components/organisms/agents/form-error"
import { buildPromptGuidance } from "@/components/organisms/agents/prompt-guidance"

describe("buildPromptGuidance", () => {
  it("hanya tool terpilih yang punya contoh; skill diabaikan pada mode standard", () => {
    const items = buildPromptGuidance(["web_search", "upload_media"], "standard", ["anti-ai-editor"])
    expect(items.map((item) => item.id)).toEqual(["web_search"])
  })

  it("mode deep: anti-ai-editor lebih dulu lalu skill lain", () => {
    const items = buildPromptGuidance([], "deep", ["gaya-saya", "anti-ai-editor"])
    expect(items.map((item) => [item.id, item.type])).toEqual([
      ["anti-ai-editor", "skill"],
      ["gaya-saya", "skill"],
    ])
  })
})

describe("firstErrorMessage", () => {
  it("membaca error level array, root, atau elemen pertama (issue server toolIds.0)", () => {
    expect(firstErrorMessage({ message: "Maksimal 20 tool." })).toBe("Maksimal 20 tool.")
    expect(firstErrorMessage(Object.assign([], { root: { message: "Root" } }))).toBe("Root")
    expect(firstErrorMessage([undefined, { message: "Tool tidak dikenal." }])).toBe("Tool tidak dikenal.")
    expect(firstErrorMessage(undefined)).toBeUndefined()
  })
})
