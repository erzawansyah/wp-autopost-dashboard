import type { ReactNode } from "react"
import { Bot, BrainCircuit, History, Info } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import {
  agentModeLabel,
  checkpointStepLabel,
  formatCount,
  formatDuration,
  formatUsd,
  stopReasonLabel,
} from "@/lib/queue/run-metrics"
import { formatIndonesianDateTime } from "@/lib/scheduler/date-calculator"
import type { AgentRunInfo, AgentRunTotals, GenerationCheckpointSummary } from "@/types/posts"

interface PostDetailRunSummaryProps {
  agentRun: AgentRunInfo | null
  totals: AgentRunTotals
  checkpoints: GenerationCheckpointSummary[]
}

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border/70 bg-card px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm font-semibold text-foreground">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}

/**
 * Biaya & pemakaian Agent Profile run per artikel: total seluruh percobaan (LLM calls, token, biaya USD —
 * `null` = tidak dilaporkan provider), run terakhir (model, mode, durasi, alasan berhenti, langkah yang
 * dipakai ulang dari checkpoint), dan checkpoint yang tersimpan untuk percobaan berikutnya.
 */
export function PostDetailRunSummary({ agentRun, totals, checkpoints }: PostDetailRunSummaryProps) {
  const ModeIcon = agentRun?.profile_snapshot?.mode === "deep" ? BrainCircuit : Bot
  const resumed = agentRun?.resumed_steps ?? []
  const stopReason = stopReasonLabel(agentRun?.stop_reason)
  const modelUsage = agentRun?.model_usage ?? []

  return (
    <Card className="border-border/80 shadow-2xs">
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ModeIcon aria-hidden="true" className="size-4 text-primary" />
          Biaya &amp; pemakaian AI
        </CardTitle>
        <CardDescription className="text-xs">
          Total {formatCount(totals.runs)} percobaan. Langkah yang dipakai ulang dari checkpoint tidak dihitung dua kali.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Metric label="Biaya (USD)" value={formatUsd(totals.costUsd)} />
          <Metric label="Total token" value={formatCount(totals.tokensTotal)} />
          <Metric label="Panggilan LLM" value={formatCount(totals.llmCalls)} />
          <Metric label="Percobaan" value={formatCount(totals.runs)} />
        </dl>

        {agentRun ? (
          <div className="flex flex-col gap-2.5 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">Run terakhir</span>
              <Badge variant="outline" className="text-xs">
                {agentModeLabel(agentRun)}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {agentRun.status === "completed" ? "Selesai" : agentRun.status === "running" ? "Berjalan" : "Gagal"}
              </Badge>
              {resumed.length > 0 && (
                <Badge variant="info">
                  <History aria-hidden="true" className="size-3" />
                  Dilanjutkan dari checkpoint: {resumed.map(checkpointStepLabel).join(", ")}
                </Badge>
              )}
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Agent Profile:</dt>
                <dd className="truncate font-medium text-foreground">
                  {agentRun.profile_snapshot?.name ?? agentRun.profile_ref}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Model:</dt>
                <dd className="truncate font-mono text-foreground">
                  {agentRun.model ?? agentRun.profile_snapshot?.model ?? "—"}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Token run ini:</dt>
                <dd className="font-mono text-foreground">
                  {formatCount(agentRun.tokens_total)} ({formatCount(agentRun.tokens_prompt)} masuk ·{" "}
                  {formatCount(agentRun.tokens_completion)} keluar)
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Biaya run ini:</dt>
                <dd className="font-mono text-foreground">{formatUsd(agentRun.cost_usd)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Panggilan model / tool:</dt>
                <dd className="font-mono text-foreground">
                  {formatCount(agentRun.model_calls)} / {formatCount(agentRun.tool_calls)}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Durasi:</dt>
                <dd className="font-mono text-foreground">{formatDuration(agentRun.duration_ms)}</dd>
              </div>
              {stopReason && (
                <div className="flex gap-1.5">
                  <dt className="text-muted-foreground">Alasan berhenti:</dt>
                  <dd className="text-foreground">{stopReason}</dd>
                </div>
              )}
              {agentRun.word_count !== null && (
                <div className="flex gap-1.5">
                  <dt className="text-muted-foreground">Jumlah kata:</dt>
                  <dd className="font-mono text-foreground">{formatCount(agentRun.word_count)}</dd>
                </div>
              )}
            </dl>
            {modelUsage.length > 1 && (
              <div className="flex flex-col gap-1 border-t border-border/60 pt-2">
                <span className="font-medium text-foreground">Rincian per model (termasuk fallback)</span>
                <ul className="flex flex-col gap-0.5">
                  {modelUsage.map((usage) => (
                    <li key={usage.model} className="flex flex-wrap justify-between gap-2 font-mono">
                      <span className="truncate">{usage.model}</span>
                      <span className="text-muted-foreground">
                        {formatCount(usage.calls)} panggilan · {formatCount(usage.totalTokens)} token · {formatUsd(usage.costUsd)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Belum ada run Agent Profile untuk artikel ini.</p>
        )}

        {checkpoints.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 p-3 text-xs text-info-strong">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold">Checkpoint tersimpan</span>
              <ul className="flex flex-wrap gap-x-4 gap-y-0.5">
                {checkpoints.map((checkpoint) => (
                  <li key={checkpoint.step}>
                    {checkpointStepLabel(checkpoint.step)} — {formatIndonesianDateTime(new Date(checkpoint.updated_at))}
                  </li>
                ))}
              </ul>
              <span>
                Percobaan berikutnya melanjutkan dari langkah terakhir; dari draf tersimpan tidak ada panggilan AI ulang.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
