"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/atoms/input"
import { cn } from "@/lib/utils"

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void
}

export function SearchInput({
  className,
  value,
  onChange,
  onClear,
  placeholder = "Cari judul, keyword, atau website...",
  ...props
}: SearchInputProps) {
  const hasValue = value !== undefined && value !== ""

  return (
    <div className={cn("relative flex items-center w-full", className)}>
      <Search className="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="pl-9 pr-9 h-9 text-sm rounded-lg"
        {...props}
      />
      {hasValue && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2.5 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          aria-label="Hapus pencarian"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
