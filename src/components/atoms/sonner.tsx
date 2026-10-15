"use client"

import * as React from "react"
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/lib/hooks/use-theme"

/**
 * Toaster shadcn (Sonner) yang mengikuti tema Panitera (`useTheme`, bukan `next-themes`) dan token
 * `globals.css`. Dipasang sekali di `AppProviders`; pemicu toast lewat `notify` (`@/lib/ui/notify`).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success-strong" />,
        info: <InfoIcon className="size-4 text-info-strong" />,
        warning: <TriangleAlertIcon className="size-4 text-warning-strong" />,
        error: <OctagonXIcon className="size-4 text-destructive-strong" />,
        loading: <Loader2Icon className="size-4 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
