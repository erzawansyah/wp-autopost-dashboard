"use client"

import * as React from "react"
import { HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
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
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center text-muted-foreground/80 hover:text-primary transition-colors cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              className
            )}
            aria-label="Petunjuk bantuan"
          >
            <HelpCircle className={cn("size-3.5", iconClassName)} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          className="max-w-xs p-3 text-xs leading-relaxed font-normal bg-popover text-popover-foreground border border-border shadow-md rounded-lg z-50"
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
