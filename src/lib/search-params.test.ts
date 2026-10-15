import { describe, expect, it } from "vitest"
import { firstParam } from "@/lib/search-params"

describe("firstParam", () => {
  it("mengembalikan string apa adanya dan nilai pertama dari parameter berulang", () => {
    expect(firstParam("register")).toBe("register")
    expect(firstParam(["a", "b"])).toBe("a")
    expect(firstParam("")).toBe("")
  })

  it("parameter tidak ada atau array kosong → undefined", () => {
    expect(firstParam(undefined)).toBeUndefined()
    expect(firstParam([])).toBeUndefined()
  })
})
