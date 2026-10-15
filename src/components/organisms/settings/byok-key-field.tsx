"use client"

import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useWatch, type Control } from "react-hook-form"
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { ControlledField } from "@/components/molecules/controlled-field"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { useConfirm } from "@/lib/ui/confirm"
import { errorMessage, notify } from "@/lib/ui/notify"
import type { ApiKeysFormValues, ByokKeyField as ByokKeyFieldName } from "@/lib/validation/settings"
import { SecretKeyInput } from "./secret-key-input"

export interface KeyTestOutcome {
  message: string
  latencyMs?: number
}

export interface KeyTester {
  /** Uji kunci; `typedKey` = kunci yang sedang diketik (sudah di-trim), `""` = pakai kunci tersimpan. */
  run: (typedKey: string) => Promise<KeyTestOutcome>
  /** Server dapat menguji kunci tersimpan tanpa mengetik ulang (hanya OpenRouter). */
  storedKeyFallback?: boolean
}

interface ByokKeyFieldProps {
  control: Control<ApiKeysFormValues>
  name: ByokKeyFieldName
  /** Nama provider (judul grup & label aksi), mis. "Tavily Search". */
  title: string
  configured: boolean
  placeholder: string
  description?: React.ReactNode
  /** Tautan pendaftaran/pembuatan kunci di situs provider. */
  signup?: { href: string; label: string }
  test?: KeyTester
}

/**
 * Satu kunci BYOK: status tersamar (`configured`), input kunci baru, uji koneksi, dan hapus kunci tersimpan.
 * Nilai kunci tersimpan tidak pernah ada di client; input kosong berarti kunci lama dipertahankan saat menyimpan.
 */
export function ByokKeyField({ control, name, title, configured, placeholder, description, signup, test }: ByokKeyFieldProps) {
  const titleId = React.useId()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const typedKey = useWatch({ control, name }).trim()

  const testKey = useMutation({
    // Variabel = kunci API plaintext yang diuji: buang dari cache mutation begitu field unmount.
    gcTime: 0,
    mutationFn: (key: string) => {
      if (!test) throw new Error("Pengujian tidak tersedia untuk kunci ini.")
      return test.run(key)
    },
  })

  const removeKey = useMutation({
    mutationFn: () => apiFetch<{ message: string }>("/api/settings/user", { method: "PUT", body: { [name]: "" } }),
    onSuccess: async () => {
      notify.success(`Kunci API ${title} dihapus.`)
      testKey.reset()
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })
    },
    onError: (error) => notify.error(error, { fallback: `Gagal menghapus kunci API ${title}.` }),
  })

  async function handleRemove() {
    const ok = await confirm({
      title: `Hapus kunci API ${title}?`,
      description: "Kunci terenkripsi dihapus dari akun Anda. Fitur yang memakainya berhenti sampai Anda menyimpan kunci baru.",
      tone: "destructive",
    })
    if (ok) removeKey.mutate()
  }

  const canTest = Boolean(test) && (typedKey !== "" || (Boolean(test?.storedKeyFallback) && configured))

  return (
    <div role="group" aria-labelledby={titleId} className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p id={titleId} className="text-xs font-semibold text-foreground">
            {title}
          </p>
          <KeyStatusBadge configured={configured} />
        </div>
        {signup && (
          <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
            <a href={signup.href} target="_blank" rel="noopener noreferrer">
              {signup.label}
              <ExternalLink aria-hidden="true" className="size-3" />
              <span className="sr-only">(membuka tab baru)</span>
            </a>
          </Button>
        )}
      </div>

      {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}

      <ControlledField
        control={control}
        name={name}
        label={`Kunci API ${title}`}
        hint={
          configured
            ? "Kunci tersimpan terenkripsi. Biarkan kosong untuk mempertahankannya, atau ketik kunci baru untuk mengganti."
            : "Disimpan terenkripsi AES-256-GCM di server; tidak pernah disimpan di browser."
        }
      >
        {(field) => (
          <div className="flex flex-col gap-2 sm:flex-row">
            <SecretKeyInput {...field} placeholder={configured ? "•••••••• (tersimpan)" : placeholder} />
            <div className="flex shrink-0 gap-2">
              {test && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => testKey.mutate(typedKey)}
                  disabled={!canTest || testKey.isPending}
                  className="h-9 cursor-pointer gap-1.5 text-xs"
                >
                  {testKey.isPending ? (
                    <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <RefreshCw aria-hidden="true" className="size-3.5" />
                  )}
                  Uji Kunci
                </Button>
              )}
              {configured && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemove}
                  disabled={removeKey.isPending}
                  aria-label={`Hapus kunci API ${title} yang tersimpan`}
                  className="size-9 cursor-pointer p-0 text-muted-foreground hover:text-destructive"
                >
                  {removeKey.isPending ? (
                    <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Trash2 aria-hidden="true" className="size-3.5" />
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </ControlledField>

      {testKey.isSuccess && (
        <Alert variant="success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <AlertDescription className="flex w-full flex-row items-center justify-between gap-2">
            <span>{testKey.data.message}</span>
            {typeof testKey.data.latencyMs === "number" && (
              <span className="shrink-0 font-mono text-2xs opacity-80">{testKey.data.latencyMs} ms</span>
            )}
          </AlertDescription>
        </Alert>
      )}
      {testKey.isError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{errorMessage(testKey.error, `Gagal menguji kunci API ${title}.`)}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

/** Status kunci tersamar: hanya "tersimpan"/"belum diatur", tidak pernah sebagian nilai kunci. */
function KeyStatusBadge({ configured }: { configured: boolean }) {
  if (!configured) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Belum diatur
      </Badge>
    )
  }
  return (
    <Badge variant="success">
      <ShieldCheck aria-hidden="true" />
      Tersimpan terenkripsi
    </Badge>
  )
}
