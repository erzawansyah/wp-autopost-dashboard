import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { LlmUsageLedger } from "@/core/shared/llm/usage"
import { WriterRequestSchema } from "../types/contracts"
import {
  GENERATION_CHECKPOINT_SCHEMA_VERSION,
  computeGenerationInputKeys,
  planGenerationResume,
  usageSince,
} from "./checkpoints"

/** Fungsi murni checkpoint generasi: selisih pemakaian per langkah & pemilihan checkpoint resume. */

function call(ledger: LlmUsageLedger, model: string, totalTokens: number, costUsd?: number) {
  ledger.recordSuccess({
    model,
    promptTokens: totalTokens,
    completionTokens: 0,
    totalTokens,
    reasoningTokens: 0,
    cachedPromptTokens: 0,
    costUsd,
  })
}

describe("usageSince", () => {
  it("menghitung pemakaian di antara dua snapshot per model (model tanpa pemakaian baru dibuang)", () => {
    const ledger = new LlmUsageLedger()
    call(ledger, "acme/a", 100, 0.1)
    const before = ledger.snapshot()
    call(ledger, "acme/a", 50, 0.2)
    call(ledger, "acme/b", 30)
    ledger.recordFailure("acme/b")

    const delta = usageSince(before, ledger.snapshot())

    expect(delta).toMatchObject({ calls: 2, failedCalls: 1, totalTokens: 80, costUsd: 0.2 })
    expect(delta.byModel).toEqual([
      expect.objectContaining({ model: "acme/a", calls: 1, totalTokens: 50, costUsd: 0.2 }),
      expect.objectContaining({ model: "acme/b", calls: 1, failedCalls: 1, totalTokens: 30, costUsd: null }),
    ])
  })

  it("tanpa panggilan baru → nol (biaya mengikuti snapshot akhir)", () => {
    const ledger = new LlmUsageLedger()
    call(ledger, "acme/a", 10, 0.5)
    const snapshot = ledger.snapshot()
    expect(usageSince(snapshot, snapshot)).toMatchObject({ calls: 0, totalTokens: 0, costUsd: 0, byModel: [] })
  })
})

describe("planGenerationResume", () => {
  const keys = { preResolve: "pre", draft: "draft" }

  it("langkah tak dikenal dan versi skema lain diabaikan; tanpa checkpoint → rencana kosong", () => {
    expect(planGenerationResume(undefined, keys)).toEqual({ ignored: [] })
    const plan = planGenerationResume(
      [
        { step: "agent_loop", schemaVersion: GENERATION_CHECKPOINT_SCHEMA_VERSION, data: {} },
        { step: "pre_resolve", schemaVersion: 0, data: {} },
      ],
      keys
    )
    expect(plan).toEqual({
      ignored: [
        { step: "agent_loop", reason: "unknown_step" },
        { step: "pre_resolve", reason: "schema_version" },
      ],
    })
  })
})

describe("computeGenerationInputKeys — kategori per baris", () => {
  const profile = { ref: "preset:quick-writer", mode: "standard" as const }
  const keysFor = (publishing: Record<string, unknown>) =>
    computeGenerationInputKeys(WriterRequestSchema.parse({ content: { keyword: "kopi" }, publishing }), profile)

  it("nama kategori per baris ikut sidik pre_resolve & draft; tanpa nama sidik sama dengan sebelum field ini ada", () => {
    const withoutNames = keysFor({ mode: "draft", categoryIds: [3] })
    const withNames = keysFor({ mode: "draft", categoryIds: [3], categoryNames: ["Wisata"] })

    expect(withNames.preResolve).not.toBe(withoutNames.preResolve)
    expect(withNames.draft).not.toBe(withoutNames.draft)
    expect(keysFor({ mode: "draft", categoryIds: [3], categoryNames: [] })).toEqual(withoutNames)
    // Sidik lama (tanpa key `categoryNames`) tidak berubah: checkpoint item yang sedang berjalan tetap dipakai.
    expect(withoutNames.preResolve).toBe(
      createHash("sha256")
        .update(
          JSON.stringify({
            keyword: "kopi",
            language: "id",
            brief: null,
            site: null,
            authorId: null,
            categoryIds: [3],
            tagNames: [],
          })
        )
        .digest("hex")
    )
  })
})
