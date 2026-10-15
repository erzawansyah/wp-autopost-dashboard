"use client"

import { Languages } from "lucide-react"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select"
import { SUPPORTED_LANGUAGES } from "@/lib/constants/languages"

interface LanguageSelectProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
  /** Dari `ControlledField`/`FormField` agar label & pesan galat tersambung ke trigger. */
  id?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "aria-required"?: boolean
}

/** Pemilih bahasa artikel (dipakai form penulis & Lab). */
export function LanguageSelect({
  value,
  onValueChange,
  disabled = false,
  className,
  placeholder = "Pilih bahasa...",
  id,
  ...aria
}: LanguageSelectProps) {
  const currentLang = SUPPORTED_LANGUAGES.find((lang) => lang.code === value)

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className={className || "h-9 bg-background text-xs"} {...aria}>
        <span className="flex items-center gap-2 truncate">
          <Languages aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
          <SelectValue placeholder={placeholder}>
            {currentLang ? (
              <span className="flex items-center gap-1.5 truncate">
                <span aria-hidden="true">{currentLang.flag}</span>
                <span className="truncate">{currentLang.name}</span>
              </span>
            ) : (
              placeholder
            )}
          </SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code} className="text-xs">
              <span className="flex w-full items-center justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="text-sm">
                    {lang.flag}
                  </span>
                  <span className="font-medium">{lang.name}</span>
                </span>
                <span className="font-mono text-2xs text-muted-foreground">{lang.code.toUpperCase()}</span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
