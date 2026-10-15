"use client"

import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Pencil, Play, Trash2 } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardContent } from "@/components/atoms/card"
import { Switch } from "@/components/atoms/switch"
import { apiFetch } from "@/lib/api/client"
import { webhooksQueries } from "@/lib/api/queries/webhooks"
import { queryKeys } from "@/lib/api/query-keys"
import { useConfirm } from "@/lib/ui/confirm"
import { notify } from "@/lib/ui/notify"
import { cn } from "@/lib/utils"
import type { WebhookItem } from "@/types/webhook"
import { WebhookFormDialog } from "./webhook-form-dialog"

/** Satu webhook: status aktif (optimistic), tes ping bertanda tangan, ubah, dan hapus dengan konfirmasi. */
export function WebhookCard({ webhook }: { webhook: WebhookItem }) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [editOpen, setEditOpen] = React.useState(false)
  const listKey = webhooksQueries.list().queryKey
  const { id, name, url, events, is_active: isActive } = webhook

  const invalidateWebhooks = () => queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all })

  const toggleActive = useMutation({
    mutationFn: (nextActive: boolean) =>
      apiFetch<{ webhook: WebhookItem }>(`/api/webhooks/${id}`, { method: "PATCH", body: { is_active: nextActive } }),
    // Nilai akhir pasti (boolean yang dikirim) → aman optimistic; rollback bila gagal.
    onMutate: async (nextActive) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData(listKey)
      queryClient.setQueryData(listKey, (current) =>
        current?.map((item) => (item.id === id ? { ...item, is_active: nextActive } : item))
      )
      return { previous }
    },
    onSuccess: (_data, nextActive) => notify.success(nextActive ? `Webhook "${name}" diaktifkan.` : `Webhook "${name}" dinonaktifkan.`),
    onError: (error, _nextActive, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous)
      notify.error(error, { fallback: "Gagal mengubah status webhook." })
    },
    onSettled: invalidateWebhooks,
  })

  const ping = useMutation({
    mutationFn: () => apiFetch<{ status: number; latencyMs: number }>(`/api/webhooks/${id}/test`, { method: "POST" }),
    onSuccess: ({ status, latencyMs }) =>
      notify.success(`Tes ping ke "${name}" berhasil.`, { description: `Respons HTTP ${status} · ${latencyMs} ms` }),
    onError: (error) => notify.error(error, { fallback: `Tes ping ke "${name}" gagal.` }),
  })

  const remove = useMutation({
    mutationFn: () => apiFetch<{ message: string }>(`/api/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: async ({ message }) => {
      notify.success(message)
      await invalidateWebhooks()
    },
    onError: (error) => notify.error(error, { fallback: "Gagal menghapus webhook." }),
  })

  async function handleDelete() {
    const ok = await confirm({
      title: `Hapus webhook "${name}"?`,
      description: "Endpoint ini tidak akan menerima notifikasi lagi dan secret-nya ikut dihapus. Tindakan ini tidak dapat dibatalkan.",
      tone: "destructive",
    })
    if (ok) remove.mutate()
  }

  return (
    <Card className={cn("gap-0 border-border/80 py-0 shadow-2xs", !isActive && "bg-muted/30")}>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">{name}</h2>
              <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "Aktif" : "Nonaktif"}</Badge>
            </div>
            <p className="truncate font-mono text-xs text-muted-foreground">{url}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Switch
              checked={isActive}
              onCheckedChange={(checked) => toggleActive.mutate(checked)}
              disabled={toggleActive.isPending}
              aria-label={`Webhook "${name}" aktif`}
              className="mr-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ping.isPending || !isActive}
              onClick={() => ping.mutate()}
              className="h-8 cursor-pointer gap-1.5 text-xs"
            >
              {ping.isPending ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Play aria-hidden="true" className="size-3.5 text-primary" />
              )}
              Tes Ping
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(true)}
              aria-label={`Ubah webhook "${name}"`}
              className="size-8 cursor-pointer p-0 text-muted-foreground hover:text-foreground"
            >
              <Pencil aria-hidden="true" className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={remove.isPending}
              onClick={handleDelete}
              aria-label={`Hapus webhook "${name}"`}
              className="size-8 cursor-pointer p-0 text-muted-foreground hover:text-destructive"
            >
              {remove.isPending ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Trash2 aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Event:</span>
          {events.map((event) => (
            <Badge key={event} variant="outline" className="border-primary/20 bg-primary/5 font-mono text-2xs">
              {event}
            </Badge>
          ))}
        </div>
      </CardContent>

      <WebhookFormDialog open={editOpen} onOpenChange={setEditOpen} webhook={webhook} onSaved={() => setEditOpen(false)} />
    </Card>
  )
}
