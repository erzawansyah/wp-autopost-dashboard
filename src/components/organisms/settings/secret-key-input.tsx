"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/atoms/input"
import { cn } from "@/lib/utils"

type SecretKeyInputProps = Omit<React.ComponentProps<typeof Input>, "type">

/**
 * Input kunci API/secret tersamar dengan tombol tampil/sembunyikan. Nilainya hanya yang sedang diketik pengguna
 * (kunci tersimpan tidak pernah dikirim server), tanpa autofill/autocorrect browser.
 */
export function SecretKeyInput({ className, ...props }: SecretKeyInputProps) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative flex-1">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className={cn("pr-9 font-mono text-xs", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Sembunyikan kunci" : "Tampilkan kunci"}
        aria-pressed={visible}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {visible ? <EyeOff aria-hidden="true" className="size-3.5" /> : <Eye aria-hidden="true" className="size-3.5" />}
      </button>
    </div>
  )
}
