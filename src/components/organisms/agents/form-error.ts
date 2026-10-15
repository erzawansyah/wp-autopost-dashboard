/**
 * Pesan error pertama dari state field array react-hook-form (`toolIds`, `skills`). Error bisa berada di
 * level array (`.message`/`.root.message`) atau per elemen (`[i].message`, mis. dari `applyApiIssues`
 * untuk issue server `toolIds.0`). Tidak menelusuri properti lain (mis. `ref` elemen DOM).
 */
export function firstErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const { message, root } = error as { message?: unknown; root?: { message?: unknown } }
  if (typeof message === "string" && message) return message
  if (typeof root?.message === "string" && root.message) return root.message
  if (!Array.isArray(error)) return undefined
  for (const item of error) {
    const itemMessage = (item as { message?: unknown } | undefined)?.message
    if (typeof itemMessage === "string" && itemMessage) return itemMessage
  }
  return undefined
}
