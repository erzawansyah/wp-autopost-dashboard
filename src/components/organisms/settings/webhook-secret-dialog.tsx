"use client"

import * as React from "react"
import { CheckCircle2, Copy, Shield } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog"
import { Input } from "@/components/atoms/input"
import { FormField } from "@/components/molecules/form-field"
import { notify } from "@/lib/ui/notify"

export interface CreatedWebhookSecret {
  name: string
  secret: string
}

interface WebhookSecretDialogProps {
  created: CreatedWebhookSecret | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Setelah animasi tutup selesai — pemanggil membuang secret dari state (tidak ditampilkan lagi). */
  onClosed: () => void
}

/**
 * Tampilkan secret HMAC webhook baru SEKALI (server tidak pernah mengembalikannya lagi). Klik di luar dialog
 * tidak menutupnya agar secret tidak hilang tanpa sengaja; tutup lewat tombol konfirmasi, X, atau Esc.
 */
export function WebhookSecretDialog({ created, open, onOpenChange, onClosed }: WebhookSecretDialogProps) {
  const inputId = React.useId()

  async function copySecret(secret: string) {
    try {
      await navigator.clipboard.writeText(secret)
      notify.success("Secret webhook disalin ke clipboard.")
    } catch {
      notify.error("Gagal menyalin otomatis. Pilih teks secret lalu salin secara manual.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={onClosed}
      >
        {created && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base text-success-strong">
                <CheckCircle2 aria-hidden="true" className="size-5" />
                Webhook &quot;{created.name}&quot; berhasil didaftarkan
              </DialogTitle>
              <DialogDescription className="text-xs">
                Simpan <strong>Secret Key</strong> di bawah ini sekarang. Demi keamanan, secret tidak akan ditampilkan lagi.
              </DialogDescription>
            </DialogHeader>

            <Alert variant="warning" role="note">
              <Shield aria-hidden="true" />
              <AlertTitle>Header verifikasi</AlertTitle>
              <AlertDescription>
                <p className="font-mono text-xs leading-relaxed">
                  X-Panitera-Timestamp: &lt;unix detik&gt;
                  <br />
                  X-Panitera-Signature: sha256=HMAC_SHA256(secret, &quot;timestamp.rawBody&quot;)
                </p>
                <p>Bandingkan tanda tangan secara constant-time dan tolak timestamp yang selisihnya lebih dari 5 menit.</p>
              </AlertDescription>
            </Alert>

            <FormField id={inputId} label="Secret Key">
              <div className="flex items-center gap-2">
                <Input
                  id={inputId}
                  readOnly
                  value={created.secret}
                  onFocus={(event) => event.currentTarget.select()}
                  className="bg-muted/40 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copySecret(created.secret)}
                  className="shrink-0 cursor-pointer gap-1.5 text-xs"
                >
                  <Copy aria-hidden="true" className="size-3.5" />
                  Salin
                </Button>
              </div>
            </FormField>

            <DialogFooter>
              <Button type="button" size="sm" onClick={() => onOpenChange(false)} className="w-full cursor-pointer text-xs">
                Saya Sudah Menyimpan Secret Ini
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
