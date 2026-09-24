import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const siteId = params.id

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("wp_sites")
      .delete()
      .eq("id", siteId)
      .eq("user_id", user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: "Website berhasil dihapus." })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
