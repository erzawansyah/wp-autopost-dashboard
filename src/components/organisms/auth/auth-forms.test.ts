import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement, type ReactElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { LoginForm } from "./login-form"
import { RegisterForm } from "./register-form"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}))

function renderServer(element: ReactElement): string {
  return renderToString(createElement(QueryClientProvider, { client: new QueryClient() }, element))
}

/** Tag pembuka `<form …>` dan `<button type="submit" …>` dari markup server (sebelum hydrasi). */
function openingTag(html: string, tag: "form" | "button"): string {
  const pattern = tag === "form" ? /<form\b[^>]*>/ : /<button\b[^>]*type="submit"[^>]*>/
  const match = html.match(pattern)
  if (!match) throw new Error(`Tag <${tag}> tidak ditemukan di markup.`)
  return match[0]
}

describe.each([
  ["LoginForm", () => createElement(LoginForm, { redirectTo: "/" })],
  ["RegisterForm", () => createElement(RegisterForm, { redirectTo: "/", onRegisteredWithoutSession: () => {} })],
])("%s (markup server sebelum hydrasi)", (_name, build) => {
  it("memakai method POST agar submit native tidak menaruh kredensial di query string URL", () => {
    expect(openingTag(renderServer(build()), "form")).toMatch(/\bmethod="post"/)
  })

  it("menonaktifkan tombol submit sampai handler React terpasang", () => {
    expect(openingTag(renderServer(build()), "button")).toMatch(/\bdisabled=""/)
  })
})
