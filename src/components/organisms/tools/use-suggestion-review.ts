"use client"

import * as React from "react"
import { useMutation } from "@tanstack/react-query"
import { errorMessage, notify } from "@/lib/ui/notify"
import {
  approvableIndices,
  canApprove,
  entryOf,
  summarizeReview,
  suggestionReviewReducer,
  type SuggestionEntry,
  type SuggestionReviewSummary,
} from "./suggestion-review"
import { useUnmountSignal } from "./use-unmount-signal"

interface SuggestionReviewOptions<TItem, TResult> {
  items: readonly TItem[]
  /** Tulis satu rekomendasi ke WordPress (mis. `POST /api/sites/[id]/categories`). */
  approve: (item: TItem) => Promise<TResult>
  /** ID objek WordPress yang dibuat, untuk label "Dibuat #ID". */
  resultId: (result: TResult) => number | undefined
  /** Nama item untuk toast/aria (mis. `Kategori "Kopi Susu"`). */
  describe: (item: TItem) => string
  /** Kata benda jamak untuk ringkasan massal (mis. "kategori", "author"). */
  noun: string
  errorFallback: string
  /** Dipanggil sekali setelah satu/sekumpulan persetujuan selesai dengan minimal satu sukses (invalidasi cache). */
  onApproved: () => Promise<unknown> | void
}

export interface SuggestionReview {
  entryOf: (index: number) => SuggestionEntry
  summary: SuggestionReviewSummary
  isBulkRunning: boolean
  approve: (index: number) => void
  approveAll: () => void
  reject: (index: number) => void
  restore: (index: number) => void
  describe: (index: number) => string
}

/**
 * Alur persetujuan rekomendasi AI bersama (kategori & author): status per item (diproses/dibuat/gagal/ditolak),
 * setujui satu (toast hasil) atau semua sisa secara berurutan (satu request per waktu agar hosting WordPress
 * tidak terbebani; ringkasan di akhir). Tulis ke WordPress lewat `useMutation` (401 → login otomatis).
 */
export function useSuggestionReview<TItem, TResult>({
  items,
  approve,
  resultId,
  describe,
  noun,
  errorFallback,
  onApproved,
}: SuggestionReviewOptions<TItem, TResult>): SuggestionReview {
  const [state, dispatch] = React.useReducer(suggestionReviewReducer, {})
  const [isBulkRunning, setIsBulkRunning] = React.useState(false)
  const getUnmountSignal = useUnmountSignal()
  const { mutateAsync } = useMutation({ mutationFn: approve })

  /** Tulis satu item; status per item diperbarui di reducer, galat dikembalikan untuk toast pemanggil. */
  const approveIndex = React.useCallback(
    async (index: number): Promise<{ ok: boolean; error?: unknown }> => {
      const item = items[index]
      if (item === undefined) return { ok: false }
      dispatch({ type: "start", index })
      try {
        const result = await mutateAsync(item)
        dispatch({ type: "succeed", index, wpId: resultId(result) })
        return { ok: true }
      } catch (error) {
        dispatch({ type: "fail", index, error: errorMessage(error, errorFallback) })
        return { ok: false, error }
      }
    },
    [items, mutateAsync, resultId, errorFallback]
  )

  const approveOne = React.useCallback(
    async (index: number) => {
      const item = items[index]
      if (item === undefined || !canApprove(entryOf(state, index))) return
      const { ok, error } = await approveIndex(index)
      if (ok) {
        notify.success(`${describe(item)} berhasil dibuat di WordPress.`)
        await onApproved()
      } else {
        notify.error(error, { fallback: errorFallback })
      }
    },
    [items, state, approveIndex, describe, onApproved, errorFallback]
  )

  const approveAll = React.useCallback(async () => {
    const queue = approvableIndices(state, items.length)
    if (queue.length === 0) return
    const signal = getUnmountSignal()
    setIsBulkRunning(true)
    let created = 0
    let failed = 0
    for (const index of queue) {
      if (signal.aborted) break
      const { ok } = await approveIndex(index)
      if (ok) created++
      else failed++
    }
    // Cache tetap diinvalidasi walau pengguna sudah pindah halaman: data di WordPress sudah berubah.
    if (created > 0) await onApproved()
    if (signal.aborted) return
    setIsBulkRunning(false)
    if (failed === 0) notify.success(`${created} ${noun} berhasil dibuat di WordPress.`)
    else
      notify.warning(`${created} ${noun} berhasil dibuat, ${failed} gagal.`, {
        description: "Periksa pesan pada kartu yang gagal, lalu setujui ulang.",
      })
  }, [state, items.length, getUnmountSignal, approveIndex, onApproved, noun])

  return {
    entryOf: (index) => entryOf(state, index),
    summary: summarizeReview(state, items.length),
    isBulkRunning,
    approve: (index) => void approveOne(index),
    approveAll: () => void approveAll(),
    reject: (index) => dispatch({ type: "reject", index }),
    restore: (index) => dispatch({ type: "restore", index }),
    describe: (index) => {
      const item = items[index]
      return item === undefined ? "" : describe(item)
    },
  }
}
