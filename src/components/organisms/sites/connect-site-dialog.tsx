"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/atoms/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { AutoConnectForm } from "./auto-connect-form"
import { ManualConnectForm } from "./manual-connect-form"

type ConnectMode = "auto" | "manual"

interface ConnectSiteDialogProps {
  /** Email/username akun Panitera (nama Application Password bawaan pada input manual). */
  accountIdentifier: string
  triggerLabel?: string
}

/**
 * Dialog "Sambungkan Website": tab otomatis (otorisasi Application Password, disarankan) dan input manual.
 * Zero-Friction Onboarding: hanya REST API + Application Passwords bawaan WordPress, tanpa plugin.
 */
export function ConnectSiteDialog({ accountIdentifier, triggerLabel = "Sambungkan Website" }: ConnectSiteDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [mode, setMode] = React.useState<ConnectMode>("auto")

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setMode("auto")
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="cursor-pointer gap-1.5">
          <Plus aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">Sambungkan Website WordPress</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Tanpa plugin tambahan — memakai REST API dan Application Passwords bawaan WordPress 5.6+.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(value) => setMode(value === "manual" ? "manual" : "auto")} className="gap-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="auto" className="cursor-pointer text-xs font-semibold">
              Otomatis (disarankan)
            </TabsTrigger>
            <TabsTrigger value="manual" className="cursor-pointer text-xs font-semibold">
              Input Manual
            </TabsTrigger>
          </TabsList>

          {/* forceMount: isian tiap tab tetap tersimpan saat berpindah tab. */}
          <TabsContent value="auto" forceMount className="data-[state=inactive]:hidden">
            <AutoConnectForm onUseManual={() => setMode("manual")} onCancel={() => setOpen(false)} />
          </TabsContent>
          <TabsContent value="manual" forceMount className="data-[state=inactive]:hidden">
            <ManualConnectForm
              accountIdentifier={accountIdentifier}
              onConnected={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
