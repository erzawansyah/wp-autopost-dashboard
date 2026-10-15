"use client"

import * as React from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"

/** `live` hanya saat kanal `SUBSCRIBED`; selain itu pemanggil memakai polling cadangan. */
export type RealtimeStatus = "connecting" | "live" | "offline"

/** Pesan Broadcast dari database (`realtime.send(payload, event, topic, private)`). */
export interface BroadcastMessage {
  event: string
  payload: unknown
}

interface TopicHandlers {
  onMessage?: (message: BroadcastMessage) => void
  onStatus?: () => void
  onLive?: () => void
}

interface TopicEntry {
  status: RealtimeStatus
  handlers: Set<TopicHandlers>
  channel: RealtimeChannel | null
  client: ReturnType<typeof createClient> | null
  releaseTimer: ReturnType<typeof setTimeout> | null
  closed: boolean
}

/**
 * Jeda sebelum kanal tanpa pendengar dilepas: navigasi antarhalaman (unmount lalu mount di commit yang sama)
 * dan mount ganda StrictMode memakai ulang kanal yang sama alih-alih join ulang.
 */
const RELEASE_DELAY_MS = 1_000

/** Satu kanal per topik per tab (realtime-js mengembalikan instance yang sama untuk topik yang sama). */
const topics = new Map<string, TopicEntry>()

function setStatus(entry: TopicEntry, status: RealtimeStatus) {
  if (entry.closed || entry.status === status) return
  entry.status = status
  for (const handlers of entry.handlers) {
    handlers.onStatus?.()
    if (status === "live") handlers.onLive?.()
  }
}

async function openChannel(topic: string, entry: TopicEntry) {
  try {
    const client = createClient()
    entry.client = client
    // Token sesi wajib terpasang sebelum join: kanal privat diotorisasi policy `realtime.messages`.
    await client.realtime.setAuth()
    // Kanal lama dengan topik sama yang masih dilepas (setelah jeda) harus selesai dulu agar tidak dipakai ulang.
    const stale = client.getChannels().find((channel) => channel.topic === `realtime:${topic}`)
    if (stale) await client.removeChannel(stale)
    if (entry.closed) return

    entry.channel = client
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "*" }, (message: { event?: unknown; payload?: unknown }) => {
        if (typeof message.event !== "string") return
        for (const handlers of entry.handlers) handlers.onMessage?.({ event: message.event, payload: message.payload })
      })
      .subscribe((status) => setStatus(entry, status === "SUBSCRIBED" ? "live" : "offline"))
  } catch (error) {
    console.warn("[realtime] Kanal tidak dapat dibuka; memakai polling cadangan.", error)
    setStatus(entry, "offline")
  }
}

function closeChannel(topic: string, entry: TopicEntry) {
  entry.closed = true
  topics.delete(topic)
  if (entry.client && entry.channel) void entry.client.removeChannel(entry.channel)
}

/** Bergabung ke topik privat (dibuat bila belum ada); mengembalikan fungsi untuk keluar. */
function joinTopic(topic: string, handlers: TopicHandlers): () => void {
  let entry = topics.get(topic)
  if (!entry) {
    entry = { status: "connecting", handlers: new Set(), channel: null, client: null, releaseTimer: null, closed: false }
    topics.set(topic, entry)
    void openChannel(topic, entry)
  }
  if (entry.releaseTimer) {
    clearTimeout(entry.releaseTimer)
    entry.releaseTimer = null
  }
  entry.handlers.add(handlers)
  // Bergabung ke kanal yang sudah live: event sebelum bergabung mungkin terlewat → segarkan sekali.
  if (entry.status === "live" && handlers.onLive) queueMicrotask(handlers.onLive)

  const joined = entry
  return () => {
    joined.handlers.delete(handlers)
    if (joined.handlers.size > 0 || joined.closed) return
    joined.releaseTimer = setTimeout(() => {
      if (joined.handlers.size === 0) closeChannel(topic, joined)
    }, RELEASE_DELAY_MS)
  }
}

function topicStatus(topic: string | null): RealtimeStatus {
  if (!topic) return "offline"
  return topics.get(topic)?.status ?? "connecting"
}

interface UseRealtimeTopicOptions {
  /** Dipanggil setiap kali kanal (kembali) `SUBSCRIBED` — tempat menyegarkan data yang mungkin terlewat. */
  onLive?: () => void
}

/**
 * Berlangganan topik Broadcast PRIVAT Supabase Realtime (`{ config: { private: true } }`) selama komponen
 * terpasang. Pesan berasal dari trigger database (`realtime.send`, migrasi `*_realtime_broadcast.sql`) dan
 * hanya dapat diterima pemilik topik: join diotorisasi policy `realtime.messages` (`user:<auth.uid()>:…`).
 *
 * - Komponen yang memakai topik sama berbagi satu kanal (dilepas 1 dtk setelah pendengar terakhir pergi).
 * - Gagal join / kanal error / Realtime nonaktif → `offline`; realtime-js mencoba bergabung ulang sendiri.
 * - `topic = null` → tidak berlangganan (status `offline`).
 */
export function useRealtimeTopic(
  topic: string | null,
  onMessage: (message: BroadcastMessage) => void,
  options: UseRealtimeTopicOptions = {}
): RealtimeStatus {
  const handleMessage = React.useEffectEvent(onMessage)
  const handleLive = React.useEffectEvent(() => options.onLive?.())

  React.useEffect(() => {
    if (!topic) return
    return joinTopic(topic, {
      onMessage: (message) => handleMessage(message),
      onLive: () => handleLive(),
    })
  }, [topic])

  return React.useSyncExternalStore(
    React.useCallback((notify: () => void) => (topic ? joinTopic(topic, { onStatus: notify }) : () => {}), [topic]),
    () => topicStatus(topic),
    () => (topic ? "connecting" : "offline")
  )
}
