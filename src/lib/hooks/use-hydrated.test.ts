import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { useHydrated } from "./use-hydrated"

function Probe() {
  return createElement("span", null, useHydrated() ? "hydrated" : "server")
}

describe("useHydrated", () => {
  it("bernilai false saat render server (markup awal sebelum hydrasi)", () => {
    expect(renderToString(createElement(Probe))).toBe("<span>server</span>")
  })
})
