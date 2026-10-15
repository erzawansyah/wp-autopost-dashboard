"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { useTheme } from "@/lib/hooks/use-theme"
import { cn } from "@/lib/utils"

interface ModeToggleProps {
  className?: string
}

export function ModeToggle({ className }: ModeToggleProps) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"
  const label = isDark ? "Beralih ke mode terang" : "Beralih ke mode gelap"

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn("size-9 cursor-pointer rounded-lg border-border/80 text-foreground shadow-2xs", className)}
      aria-label={label}
      title={label}
      suppressHydrationWarning
    >
      {isDark ? (
        <Sun aria-hidden="true" className="size-4 text-accent transition-transform duration-200" />
      ) : (
        <Moon aria-hidden="true" className="size-4 text-foreground/80 transition-transform duration-200" />
      )}
    </Button>
  )
}
