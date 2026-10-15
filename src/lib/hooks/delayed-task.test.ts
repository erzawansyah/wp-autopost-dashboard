import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createDelayedTask } from "./delayed-task"

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("createDelayedTask", () => {
  it("menjalankan tugas setelah jeda", () => {
    const run = vi.fn()
    createDelayedTask().schedule(run, 700)

    vi.advanceTimersByTime(699)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("dispose (unmount) membatalkan tugas yang menunggu", () => {
    const run = vi.fn()
    const task = createDelayedTask()
    task.schedule(run, 1200)
    task.dispose()

    vi.runAllTimers()
    expect(run).not.toHaveBeenCalled()
  })

  it("penjadwalan setelah dispose diabaikan (onSuccess yang selesai setelah pindah halaman)", () => {
    const run = vi.fn()
    const task = createDelayedTask()
    task.dispose()
    task.schedule(run, 10)

    vi.runAllTimers()
    expect(run).not.toHaveBeenCalled()
  })

  it("penjadwalan ulang menggantikan tugas sebelumnya", () => {
    const first = vi.fn()
    const second = vi.fn()
    const task = createDelayedTask()
    task.schedule(first, 100)
    task.schedule(second, 100)

    vi.runAllTimers()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
