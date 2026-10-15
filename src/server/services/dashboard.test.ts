import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getDashboardStats } from "./dashboard"

type Row = { user_id: string; state: string }

/** Fake PostgREST minimal untuk `select(head+count).eq().in()`; mencatat filter tiap query. */
function fakeClient(rows: Row[], error: { code: string; message: string } | null = null) {
  const calls: { table: string; options: unknown; eq: [string, unknown][]; in: [string, unknown[]][] }[] = []
  const client = {
    from(table: string) {
      const call = { table, options: undefined as unknown, eq: [] as [string, unknown][], in: [] as [string, unknown[]][] }
      calls.push(call)
      const query = {
        select(_columns: string, options: unknown) {
          call.options = options
          return query
        },
        eq(column: string, value: unknown) {
          call.eq.push([column, value])
          return query
        },
        in(column: string, values: unknown[]) {
          call.in.push([column, values])
          return query
        },
        then<T>(onFulfilled: (value: { count: number | null; error: typeof error }) => T) {
          const count = rows.filter(
            (row) =>
              call.eq.every(([column, value]) => row[column as keyof Row] === value) &&
              call.in.every(([column, values]) => values.includes(row[column as keyof Row]))
          ).length
          return Promise.resolve(error ? { count: null, error } : { count, error: null }).then(onFulfilled)
        },
      }
      return query
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe("getDashboardStats", () => {
  it("menghitung seluruh item milik pengguna per kelompok state tanpa memuat baris", async () => {
    const rows: Row[] = [
      { user_id: "u1", state: "published_on_wp" },
      { user_id: "u1", state: "published_on_wp" },
      { user_id: "u1", state: "generating_content" },
      { user_id: "u1", state: "queued_input" },
      { user_id: "u1", state: "scheduled_on_wp" },
      { user_id: "u1", state: "saved_draft_on_wp" },
      { user_id: "u1", state: "failed_sync" },
      { user_id: "u2", state: "failed_generation" },
    ]
    const { client, calls } = fakeClient(rows)

    expect(await getDashboardStats(client, "u1")).toEqual({ published: 2, inFlight: 2, onWordPress: 2, failed: 1 })
    expect(calls).toHaveLength(4)
    for (const call of calls) {
      expect(call.table).toBe("post_items")
      expect(call.options).toEqual({ count: "exact", head: true })
      expect(call.eq).toContainEqual(["user_id", "u1"])
    }
  })

  it("galat database diteruskan sebagai ApiError (bukan angka 0 diam-diam)", async () => {
    const { client } = fakeClient([], { code: "42501", message: "permission denied" })
    await expect(getDashboardStats(client, "u1")).rejects.toMatchObject({ status: 403 })
  })
})
