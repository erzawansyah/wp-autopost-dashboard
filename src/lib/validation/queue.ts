import { z } from "zod"

/** Skema murni domain antrean yang dibutuhkan client & server. */

/** 9 state antrean (PRD §4, `post_items.state`). Jangan menambah state tanpa memperbarui PRD/ARCHITECTURE. */
export const POST_ITEM_STATES = [
  "queued_input",
  "generating_content",
  "ready_to_sync",
  "syncing_to_wp",
  "published_on_wp",
  "scheduled_on_wp",
  "saved_draft_on_wp",
  "failed_generation",
  "failed_sync",
] as const

export const PostItemStateSchema = z.enum(POST_ITEM_STATES)
