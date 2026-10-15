import "server-only"
import { NextResponse } from "next/server"
import type { User } from "@supabase/supabase-js"
import type { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { serverEnv } from "@/lib/env/server"
import { verifyCronRequest } from "@/core/queue/cron-auth"
import { ApiError, badRequest, errorResponse, toApiError, unauthorized } from "./errors"
import { enforceRateLimit, type RateLimitRule } from "./rate-limit"

/**
 * Pembungkus Route Handler standar Panitera.
 *
 *   export const POST = defineRoute(
 *     { auth: "user", body: CreateSiteSchema, rateLimit: RATE_LIMITS.outboundTest },
 *     async ({ user, supabase, body }) => {
 *       ...
 *       return { site }            // → 200 { ok: true, site }
 *     }
 *   )
 *
 * - `auth`: "user" (sesi Supabase wajib), "cron" (header CRON_SECRET), "user-or-cron", "public".
 * - `body`/`query`/`params`: skema zod; input tidak valid → 400 `validation_failed`.
 * - Handler boleh mengembalikan objek (dibungkus `{ ok: true, ...obj }`), `Response`, atau `void`.
 * - Semua error dipetakan lewat `toApiError` (Postgres 23505 → 409, dst.) tanpa membocorkan detail internal.
 */

export type RouteAuth = "user" | "cron" | "user-or-cron" | "public"

type SessionClient = Awaited<ReturnType<typeof createClient>>

type UserFor<A extends RouteAuth> = A extends "user" ? User : User | null

export interface RouteContext<A extends RouteAuth, B, Q, P> {
  request: Request
  /** Pengguna sesi. Selalu ada untuk `auth: "user"`; null untuk cron/public tanpa sesi. */
  user: UserFor<A>
  /** Client Supabase sesi pengguna (RLS aktif). Gunakan admin client hanya untuk proses sistem. */
  supabase: SessionClient
  /** true jika permintaan terautentikasi sebagai cron (header CRON_SECRET). */
  isCron: boolean
  body: B
  query: Q
  params: P
}

export interface RouteConfig<A extends RouteAuth, B, Q, P> {
  auth: A
  body?: z.ZodType<B>
  query?: z.ZodType<Q>
  params?: z.ZodType<P>
  rateLimit?: RateLimitRule
  /** Nama untuk log server (default: method + path). */
  name?: string
}

type HandlerResult = Response | Record<string, unknown> | void

type NextRouteContext = { params: Promise<Record<string, string | string[] | undefined>> }

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw badRequest("Body permintaan harus berupa JSON yang valid.")
  }
}

function logServerError(name: string, err: ApiError): void {
  const cause = err.cause
  const detail =
    cause instanceof Error
      ? `${cause.name}: ${cause.message}`
      : typeof cause === "object" && cause !== null && "message" in cause
        ? String((cause as { message: unknown }).message)
        : ""
  console.error(`[api:${name}] ${err.code} (${err.status})${detail ? ` — ${detail}` : ""}`)
}

export function defineRoute<A extends RouteAuth, B = undefined, Q = undefined, P = undefined>(
  config: RouteConfig<A, B, Q, P>,
  handler: (ctx: RouteContext<A, B, Q, P>) => Promise<HandlerResult>
): (request: Request, context: NextRouteContext) => Promise<Response> {
  return async (request, context) => {
    const name = config.name ?? `${request.method} ${new URL(request.url).pathname}`
    try {
      const supabase = await createClient()
      let user: User | null = null
      let isCron = false

      if (config.auth === "cron" || config.auth === "user-or-cron") {
        isCron = verifyCronRequest(request.headers, serverEnv().CRON_SECRET).ok
      }
      if (config.auth === "user" || (config.auth === "user-or-cron" && !isCron) || config.auth === "public") {
        const { data, error } = await supabase.auth.getUser()
        user = error ? null : data.user
      }
      if (config.auth === "user" && !user) throw unauthorized()
      if (config.auth === "cron" && !isCron) throw unauthorized("Token cron tidak valid.")
      if (config.auth === "user-or-cron" && !isCron && !user) throw unauthorized()

      if (config.rateLimit && !isCron) {
        const identity = user?.id ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon"
        enforceRateLimit(config.rateLimit, identity)
      }

      const params = config.params ? config.params.parse(await context.params) : (undefined as P)
      const query = config.query
        ? config.query.parse(Object.fromEntries(new URL(request.url).searchParams))
        : (undefined as Q)
      const body = config.body ? config.body.parse(await readJsonBody(request)) : (undefined as B)

      const result = await handler({
        request,
        user: user as UserFor<A>,
        supabase,
        isCron,
        body,
        query,
        params,
      })

      if (result instanceof Response) return result
      return NextResponse.json({ ok: true, ...(result ?? {}) })
    } catch (err: unknown) {
      const apiError = toApiError(err)
      if (apiError.status >= 500) logServerError(name, apiError)
      return errorResponse(apiError)
    }
  }
}
