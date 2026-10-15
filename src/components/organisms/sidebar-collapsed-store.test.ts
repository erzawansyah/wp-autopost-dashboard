import { describe, expect, it, vi } from "vitest"
import { createSidebarCollapsedStore } from "./sidebar-collapsed-store"

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
  }
}

describe("createSidebarCollapsedStore", () => {
  it("snapshot server selalu terbuka (render server = render hidrasi), terlepas dari nilai tersimpan", () => {
    const store = createSidebarCollapsedStore(() => memoryStorage({ wp_sidebar_collapsed: "true" }))
    expect(store.getServerSnapshot()).toBe(false)
    expect(store.getSnapshot()).toBe(true)
  })

  it("storage dibaca sekali lalu di-cache", () => {
    const storage = memoryStorage({ wp_sidebar_collapsed: "true" })
    const store = createSidebarCollapsedStore(() => storage)
    store.getSnapshot()
    store.getSnapshot()
    expect(storage.getItem).toHaveBeenCalledTimes(1)
  })

  it("toggle menyimpan nilai baru dan memberi tahu pelanggan sampai berhenti berlangganan", () => {
    const storage = memoryStorage()
    const store = createSidebarCollapsedStore(() => storage)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.toggle()
    expect(store.getSnapshot()).toBe(true)
    expect(storage.setItem).toHaveBeenLastCalledWith("wp_sidebar_collapsed", "true")
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.toggle()
    expect(store.getSnapshot()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("storage tidak tersedia atau melempar galat → terbuka, toggle tetap berfungsi di memori", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError")
      },
      setItem: () => {
        throw new Error("QuotaExceededError")
      },
    }
    const store = createSidebarCollapsedStore(() => throwing)
    expect(store.getSnapshot()).toBe(false)
    store.toggle()
    expect(store.getSnapshot()).toBe(true)

    expect(createSidebarCollapsedStore(() => null).getSnapshot()).toBe(false)
  })
})
