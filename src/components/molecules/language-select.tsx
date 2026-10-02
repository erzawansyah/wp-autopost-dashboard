"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import { SUPPORTED_LANGUAGES } from "@/lib/constants/languages"
import { Languages } from "lucide-react"

interface LanguageSelectProps {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
}

export function LanguageSelect({
  value,
  onValueChange,
  disabled = false,
  className,
  placeholder = "Pilih bahasa...",
}: LanguageSelectProps) {
  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === value)

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className || "h-9 text-xs bg-background"}>
        <div className="flex items-center gap-2 truncate">
          <Languages className="size-3.5 text-primary shrink-0" />
          <SelectValue placeholder={placeholder}>
            {currentLang ? (
              <span className="flex items-center gap-1.5 truncate">
                <span>{currentLang.flag}</span>
                <span className="truncate">{currentLang.name}</span>
              </span>
            ) : (
              placeholder
            )}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <SelectItem key={lang.code} value={lang.code} className="text-xs">
            <div className="flex items-center justify-between w-full gap-3">
              <span className="flex items-center gap-1.5">
                <span className="text-sm">{lang.flag}</span>
                <span className="font-medium">{lang.name}</span>
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {lang.code.toUpperCase()}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
