"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { cn } from "@/lib/utils"

const themeListeners = new Set<() => void>()

function subscribe(callback: () => void) {
  themeListeners.add(callback)
  const onStorage = (e: StorageEvent) => {
    if (e.key === "theme") {
      callback()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    themeListeners.delete(callback)
    window.removeEventListener("storage", onStorage)
  }
}

function getSnapshot(): boolean {
  if (typeof document === "undefined") return false
  return document.documentElement.classList.contains("dark")
}

function getServerSnapshot(): boolean {
  return false
}

interface ModeToggleProps {
  className?: string
}

export function ModeToggle({ className }: ModeToggleProps) {
  const isDark = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const toggleTheme = () => {
    const nextDark = !isDark
    if (nextDark) {
      document.documentElement.classList.add("dark")
      try {
        localStorage.setItem("theme", "dark")
      } catch {
        // Abaikan jika localStorage diblokir
      }
    } else {
      document.documentElement.classList.remove("dark")
      try {
        localStorage.setItem("theme", "light")
      } catch {
        // Abaikan jika localStorage diblokir
      }
    }
    themeListeners.forEach((listener) => listener())
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className={cn("size-9 rounded-lg border-border/80 text-foreground cursor-pointer shadow-2xs", className)}
      aria-label="Toggle tema gelap atau terang"
      title={isDark ? "Beralih ke mode terang" : "Beralih ke mode gelap"}
      suppressHydrationWarning
    >
      {isDark ? (
        <Sun className="size-4 text-amber-400 transition-transform duration-200" />
      ) : (
        <Moon className="size-4 text-slate-700 dark:text-slate-300 transition-transform duration-200" />
      )}
    </Button>
  )
}
