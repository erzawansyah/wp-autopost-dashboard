"use client"

import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/atoms/alert-dialog"
import type { ConfirmOptions } from "@/lib/ui/confirm"

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/**
 * Dialog konfirmasi (Radix AlertDialog): fokus awal di tombol Batal, Esc/klik luar = batal.
 * Umumnya dipakai lewat `useConfirm()`; render langsung hanya bila butuh dialog terkontrol sendiri.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  tone = "default",
}: ConfirmDialogProps) {
  const isDestructive = tone === "destructive"

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="default">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="text-sm leading-relaxed">{description}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="sr-only">Konfirmasi tindakan</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm" className="cursor-pointer">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            size="sm"
            variant={isDestructive ? "destructive" : "default"}
            onClick={onConfirm}
            className="cursor-pointer"
          >
            {confirmLabel ?? (isDestructive ? "Hapus" : "Lanjutkan")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
