"use client"

import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { useDelayedPush } from "@/lib/hooks/use-delayed-push"
import { defaultScheduleWindow } from "@/lib/queue/writer-options"
import { notify } from "@/lib/ui/notify"
import type { BatchSettingsFormInput, CreateBatchBody } from "@/lib/validation/batches"
import type { Site } from "@/types/site"

/** Jeda agar banner sukses terlihat sebelum pindah ke Antrean batch baru. */
const REDIRECT_DELAY_MS = 1200

export interface CreatedBatchInfo {
  id: string
  name: string
  totalItems: number
}

interface CreateBatchResponse {
  batch: { id: string; name: string; totalItems: number }
}

/**
 * Nilai awal pengaturan batch (jadwal: mulai sekarang, rentang acak 7 hari — zona waktu browser).
 * `agentProfileRef` = Agent Profile default pengguna (`defaultAgentProfileRef`).
 */
export function batchSettingsDefaults(defaultSiteId: string, agentProfileRef: string): BatchSettingsFormInput {
  const range = defaultScheduleWindow()
  return {
    siteId: defaultSiteId,
    batchName: "",
    agentProfileRef,
    language: "id",
    categoryIds: [],
    categoryNames: [],
    tags: "",
    customBrief: "",
    strategy: {
      executionMode: "immediate",
      mode: "interval",
      randomStartDate: range.start,
      randomEndDate: range.end,
      intervalStartDate: range.start,
      intervalHours: 12,
      intervalJitter: true,
      targetStatus: "publish",
    },
  }
}

/** Situs default: situs pertama, atau hanya bila tepat satu (`single`) agar pengguna memilih sendiri. */
export function defaultSiteIdFor(sites: Site[], strategy: "first" | "single"): string {
  if (strategy === "single") return sites.length === 1 ? sites[0].id : ""
  return sites[0]?.id ?? ""
}

/**
 * `POST /api/batches` (hanya mencatat batch + item `queued_input`, runner antrean yang memproses):
 * invalidasi cache antrean/batch, toast, lalu pindah ke `/queue/items?batchId=…` (dibatalkan bila form unmount).
 */
export function useCreateBatch(options: { onError: (error: unknown) => void }) {
  const delayedPush = useDelayedPush(REDIRECT_DELAY_MS)
  const queryClient = useQueryClient()
  const [created, setCreated] = React.useState<CreatedBatchInfo | null>(null)

  const mutation = useMutation({
    mutationFn: (body: CreateBatchBody) => apiFetch<CreateBatchResponse>("/api/batches", { method: "POST", body }),
    onSuccess: ({ batch }) => {
      setCreated(batch)
      notify.success(`${batch.totalItems} artikel masuk antrean batch "${batch.name}".`)
      void Promise.all(
        [queryKeys.queue.all, queryKeys.posts.all, queryKeys.batches.all].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      )
      delayedPush(`/queue/items?batchId=${encodeURIComponent(batch.id)}`)
    },
    onError: options.onError,
  })

  return { createBatch: mutation.mutate, isPending: mutation.isPending, created }
}
