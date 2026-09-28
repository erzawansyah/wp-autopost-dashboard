"use client"

import * as React from "react"
import { HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip"
import { cn } from "@/lib/utils"

export interface HelpTooltipProps {
  content: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  className?: string
  iconClassName?: string
}

export function HelpTooltip({
  content,
  side = "top",
  align = "center",
  className,
  iconClassName,
}: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full text-muted-foreground/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            className
          )}
          aria-label="Buka petunjuk"
        >
          <HelpCircle className={cn("size-3.5", iconClassName)} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} align={align}>
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
