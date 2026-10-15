import { EventEmitter } from "node:events"
import { describe, expect, it, vi } from "vitest"
import { installGracefulShutdown, type ShutdownProcess } from "@/server/queue/shutdown"

function fakeProcess(): ShutdownProcess & { exit: ReturnType<typeof vi.fn> } {
  return Object.assign(new EventEmitter(), { exit: vi.fn() })
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

describe("installGracefulShutdown", () => {
  it("menjalankan shutdown runner lebih dulu, baru handler sinyal sebelumnya (mis. milik Next.js)", async () => {
    const proc = fakeProcess()
    const order: string[] = []
    proc.on("SIGTERM", (signal: string) => order.push(`next:${signal}`))
    let finish: () => void = () => {}
    const onShutdown = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            order.push("runner")
            resolve()
          }
        })
    )

    installGracefulShutdown(onShutdown, proc)
    proc.emit("SIGTERM")
    await tick()

    expect(onShutdown).toHaveBeenCalledWith("SIGTERM")
    expect(order).toEqual([])

    finish()
    await tick()
    expect(order).toEqual(["runner", "next:SIGTERM"])
    expect(proc.exit).not.toHaveBeenCalled()
  })

  it("tanpa handler sebelumnya: keluar dengan kode sinyal standar setelah shutdown", async () => {
    const proc = fakeProcess()
    installGracefulShutdown(async () => undefined, proc)

    proc.emit("SIGINT")
    await tick()

    expect(proc.exit).toHaveBeenCalledWith(130)
  })

  it("shutdown hanya dijalankan sekali walau SIGTERM & SIGINT datang; galat shutdown tidak menahan keluar", async () => {
    const proc = fakeProcess()
    vi.spyOn(console, "error").mockImplementation(() => {})
    const onShutdown = vi.fn(async () => {
      throw new Error("gagal melepas lease")
    })
    installGracefulShutdown(onShutdown, proc)

    proc.emit("SIGTERM")
    proc.emit("SIGINT")
    await tick()

    expect(onShutdown).toHaveBeenCalledTimes(1)
    expect(proc.exit).toHaveBeenCalledWith(143)
    expect(proc.exit).toHaveBeenCalledWith(130)
    // Handler sekali pakai: sinyal kedua yang sama memakai perilaku bawaan Node (keluar paksa).
    expect(proc.listenerCount("SIGTERM")).toBe(0)
  })
})
