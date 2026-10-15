import { z } from "zod"

/** Skema zod yang dipakai bersama oleh route & service. */

export const UuidSchema = z.uuid({ error: "ID tidak valid." })

/** Params route dinamis `[id]`. */
export const IdParamsSchema = z.object({ id: UuidSchema })
