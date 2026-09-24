"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { cn } from "@/lib/utils"

interface ModeToggleProps {
  className?: string
}

export function ModeToggle({ className }: ModeToggleProps) {
  const [isDark, setIsDark] = React.useState<boolean>(false)

  React.useEffect(() => {
    // Check initial dark mode from DOM or localStorage
    const isDarkMode =
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches
    setIsDark(isDarkMode)
    if (isDarkMode) {
      document.documentElement.classList.add("dark")
    }
  }, [])

  const toggleTheme = () => {
    const nextDark = !isDark
    setIsDark(nextDark)
    if (nextDark) {
      document.documentElement.classList.add("dark")
      localStorage.setItem("theme", "dark")
    } else {
      document.documentElement.classList.remove("dark")
      localStorage.setItem("theme", "light")
    }
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className={cn("size-9 rounded-lg border-border/80 text-foreground cursor-pointer shadow-2xs", className)}
      aria-label="Toggle tema gelap/terang"
      title={isDark ? "Beralih ke Mode Terang" : "Beralih ke Mode Gelap"}
    >
      {isDark ? (
        <Sun className="size-4 text-amber-400 transition-transform duration-200" />
      ) : (
        <Moon className="size-4 text-slate-700 transition-transform duration-200" />
      )}
    </Button>
  )
}
