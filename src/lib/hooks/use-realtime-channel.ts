"use client"

import * as React from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"

/** `live` hanya saat kanal `SUBSCRIBED`; selain itu pemanggil memakai polling cadangan. */
export type RealtimeStatus = "connecting" | "live" | "offline"

/**
 * Nomor urut kanal per tab: topik dibuat unik per langganan agar dua komponen (atau mount ulang StrictMode
 * saat kanal lama masih dilepas) tidak berbagi satu instance kanal. Filter event ada di binding, bukan topik.
 */
let channelSequence = 0

interface UseRealtimeChannelOptions {
  /** Dipanggil setiap kali kanal (kembali) `SUBSCRIBED` — tempat menyegarkan data yang mungkin terlewat. */
  onLive?: () => void
}

/**
 * Berlangganan satu kanal Supabase Realtime selama komponen terpasang (dibuat ulang bila `name` berubah,
 * dilepas saat unmount). `configure` mendaftarkan binding `postgres_changes` pada kanal baru.
 *
 * - Token sesi pengguna dipasang ke socket sebelum subscribe, sehingga Realtime mengotorisasi setiap event
 *   terhadap policy RLS SELECT pemilik — tenant hanya menerima barisnya sendiri.
 * - Kegagalan (CHANNEL_ERROR/TIMED_OUT/CLOSED, Realtime nonaktif, env publik tidak ada) → `offline`;
 *   realtime-js mencoba bergabung ulang sendiri dan status kembali `live` bila berhasil.
 * - `name = null` → tidak berlangganan (status `offline`).
 */
export function useRealtimeChannel(
  name: string | null,
  configure: (channel: RealtimeChannel) => RealtimeChannel,
  options: UseRealtimeChannelOptions = {}
): RealtimeStatus {
  const [state, setState] = React.useState<{ name: string | null; status: RealtimeStatus }>({
    name: null,
    status: "connecting",
  })
  const onConfigure = React.useEffectEvent(configure)
  const onLive = React.useEffectEvent(() => options.onLive?.())

  React.useEffect(() => {
    if (!name) return
    let cancelled = false
    let channel: RealtimeChannel | null = null
    let supabase: ReturnType<typeof createClient> | null = null

    const report = (status: RealtimeStatus) => {
      if (cancelled) return
      setState({ name, status })
      if (status === "live") onLive()
    }

    void (async () => {
      try {
        supabase = createClient()
        await supabase.realtime.setAuth()
        if (cancelled) return
        channelSequence += 1
        channel = onConfigure(supabase.channel(`${name}#${channelSequence}`))
        channel.subscribe((status) => report(status === "SUBSCRIBED" ? "live" : "offline"))
      } catch (error) {
        console.warn("[realtime] Kanal tidak dapat dibuka; memakai polling cadangan.", error)
        report("offline")
      }
    })()

    return () => {
      cancelled = true
      if (supabase && channel) void supabase.removeChannel(channel)
    }
  }, [name])

  if (!name) return "offline"
  return state.name === name ? state.status : "connecting"
}
