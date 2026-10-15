import { zodResolver } from "@hookform/resolvers/zod"
import { describe, expect, it, vi } from "vitest"
import { ApiClientError } from "@/lib/api/client"
import { RegisterSchema } from "@/lib/validation/auth"
import { CreateSiteBodySchema } from "@/lib/validation/sites"
import { applyApiIssues } from "./use-zod-form"

const resolverOptions = { fields: {}, shouldUseNativeValidation: false } as const

describe("zodResolver + skema zod v4 bersama", () => {
  it("mengembalikan nilai OUTPUT zod (trim) saat valid", async () => {
    const resolver = zodResolver(CreateSiteBodySchema)
    const result = await resolver(
      { site_name: "  Blog Kopi ", base_url: " https://kopi.example ", wp_username: "admin", app_password: "abcd efgh" },
      undefined,
      resolverOptions
    )
    expect(result.errors).toEqual({})
    expect(result.values).toMatchObject({ site_name: "Blog Kopi", base_url: "https://kopi.example" })
  })

  it("memetakan pesan error Indonesia ke path field (termasuk refine lintas field)", async () => {
    const resolver = zodResolver(RegisterSchema)
    const result = await resolver(
      { email: "dev@panitera.id", password: "rahasia1", confirmPassword: "beda" },
      undefined,
      resolverOptions
    )
    expect(result.errors.confirmPassword?.message).toBe("Konfirmasi kata sandi tidak cocok.")
  })
})

describe("applyApiIssues", () => {
  const makeForm = (values: Record<string, unknown>) => ({ getValues: () => values, setError: vi.fn() })

  it("memasang issue validation_failed ke field yang ada", () => {
    const form = makeForm({ base_url: "", site_name: "" })
    const error = new ApiClientError(400, "validation_failed", "Input tidak valid", {
      issues: [
        { path: "base_url", message: "Alamat website WordPress wajib diisi." },
        { path: "tidak_ada", message: "abaikan" },
      ],
    })
    expect(applyApiIssues(form, error)).toBe(true)
    expect(form.setError).toHaveBeenCalledTimes(1)
    expect(form.setError).toHaveBeenCalledWith("base_url", { type: "server", message: "Alamat website WordPress wajib diisi." })
  })

  it("mengembalikan false untuk error tanpa issues (pemanggil menampilkan toast)", () => {
    const form = makeForm({ base_url: "" })
    expect(applyApiIssues(form, new ApiClientError(409, "conflict", "Duplikat"))).toBe(false)
    expect(applyApiIssues(form, new Error("x"))).toBe(false)
    expect(form.setError).not.toHaveBeenCalled()
  })
})
