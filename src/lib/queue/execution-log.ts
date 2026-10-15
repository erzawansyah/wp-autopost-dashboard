import type { ExecutionLog } from "@/types/posts"

/**
 * Penyajian log eksekusi (`execution_logs`) di detail artikel — modul murni: judul ramah per node/tool,
 * ringkasan, durasi, dan payload JSON input/output (sudah diredaksi worker sebelum disimpan).
 */

const TOOL_LABELS: Record<string, string> = {
  web_search: "Web Search (Penelusuran Internet)",
  keyword_suggestions: "Keyword & LSI Suggestions",
  web_reader: "Web Page Reader (Pembaca URL)",
  image_search: "Pencarian Gambar Bebas Royalti",
  set_featured_image: "Tetapkan Foto Sampul WordPress",
  upload_media: "Unggah Media ke WordPress",
}

const NODE_INFO: Record<string, { label: string; desc: string }> = {
  model_call: {
    label: "Model Reasoning (LLM)",
    desc: "Pemanggilan model kecerdasan buatan untuk merencanakan dan menyusun teks.",
  },
  tool_call: {
    label: "Pemanggilan Tool",
    desc: "Agen mengeksekusi tool untuk riset web atau kurasi visual.",
  },
  guard: {
    label: "Guardrail & Loop Protection",
    desc: "Pemeriksaan limit komputasi, deduplikasi pemanggilan tool, dan circuit breaker.",
  },
  finalize: {
    label: "Finalisasi Naskah (Direct Synthesis)",
    desc: "Pemanggilan satu kali tanpa tools untuk merangkum hasil jika batas limit tercapai.",
  },
  retry_sync_bypass: {
    label: "Bypass Konten (Idempotent Retry)",
    desc: "Konten artikel sudah siap di database; melewati pembuatan AI untuk langsung kirim ke WordPress.",
  },
  init_queue: {
    label: "Penerimaan Antrean",
    desc: "Menerima topik dan instruksi pengerjaan ke dalam antrean sistem.",
  },
  input_validator: {
    label: "Validasi Schema & Sanitasi",
    desc: "Memvalidasi kelengkapan parameter kata kunci, website, dan sanitasi input.",
  },
  taxonomy_resolver: {
    label: "Pencocokan Taksonomi & Author",
    desc: "Memetakan kategori, tag, dan author yang sesuai dengan database website.",
  },
  topic_researcher: {
    label: "Riset Topik & Cetak Biru",
    desc: "Menganalisis maksud pencarian, entitas semantik (LSI), dan merancang outline terstruktur.",
  },
  article_drafter: {
    label: "Penulisan Naskah AI",
    desc: "Menghasilkan draf naskah lengkap, judul artikel, dan kutipan (excerpt).",
  },
  image_curator: {
    label: "Kurasi & Penyisipan Gambar",
    desc: "Mencari foto berkualitas bebas royalti dan menyematkannya ke subbab artikel.",
  },
  quality_checker: {
    label: "Pemeriksaan Kualitas",
    desc: "Mengevaluasi kelayakan naskah, heading Markdown, dan bebas penolakan chatbot.",
  },
  agentic_writer: {
    label: "Agentic Writer (Autonomous Tools)",
    desc: "Agen LangChain otonom memilih tools web search, reader, dan upload media secara mandiri.",
  },
  deepagent_writer: {
    label: "Deep Agent Writer",
    desc: "LangChain Deep Agent dengan perencanaan todo, konteks berkas, skills on-demand, dan tools otonom.",
  },
  gutenberg_formatter: {
    label: "Serialisasi Blok Gutenberg",
    desc: "Mengonversi naskah Markdown menjadi blok native WordPress.",
  },
  prepare_sync: {
    label: "Persiapan Sinkronisasi",
    desc: "Menyiapkan payload naskah dan ID taksonomi sebelum dikirim ke website.",
  },
  wordpress_publisher: {
    label: "Pengiriman ke WordPress REST API",
    desc: "Mengirimkan artikel ke WordPress REST API via Application Password.",
  },
  status_sync: {
    label: "Penyelesaian Status",
    desc: "Mencatat status final artikel (terbit/draf) dan URL artikel di WordPress.",
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

export interface ExecutionLogView {
  title: string
  description: string
  /** Nama tool / step mentah untuk label mono. */
  code: string
  isError: boolean
  durationMs: number | null
  input?: Record<string, unknown>
  output?: Record<string, unknown>
}

const BRACKET_PREFIX = /^\[(.*?)\]\s*(.*)$/

/** Log mentah → tampilan (judul, ringkasan, payload JSON). */
export function describeExecutionLog(log: ExecutionLog): ExecutionLogView {
  const details = log.details ?? {}
  const bracket = BRACKET_PREFIX.exec(log.message)
  const summary = readText(details.summary) ?? bracket?.[2]
  let toolName = readText(details.tool) ?? ""
  if (!toolName && bracket && bracket[1] !== log.step) toolName = bracket[1]

  const durationMs = typeof details.durationMs === "number" ? details.durationMs : null
  const status = readText(details.status) ?? "ok"
  const isError = log.level === "error" || status === "error"

  let title: string
  let description: string
  if (log.step === "tool_call") {
    title = `Eksekusi Tool: ${TOOL_LABELS[toolName] ?? (toolName || "Tool Riset")}`
    description = summary ?? log.message
  } else if (NODE_INFO[log.step] && ["model_call", "guard", "finalize"].includes(log.step)) {
    title = NODE_INFO[log.step].label
    description = summary ?? log.message
  } else {
    const info = NODE_INFO[log.step]
    title = info?.label ?? bracket?.[1] ?? log.step
    description = summary ?? info?.desc ?? log.message
  }

  const input = isRecord(details.input) ? details.input : isRecord(details.argsPreview) ? details.argsPreview : undefined
  let output: Record<string, unknown> | undefined = isRecord(details.output) ? details.output : undefined
  if (!output && log.step === "tool_call") {
    output = {
      tool: toolName || "tool",
      status,
      ringkasan: summary ?? log.message,
      ...(durationMs !== null ? { durasi_eksekusi: `${durationMs} ms` } : {}),
    }
  } else if (!output && log.step === "model_call") {
    output = {
      status,
      ringkasan: summary ?? log.message,
      ...(details.tokens ? { tokens: details.tokens } : {}),
      ...(details.requestedTools ? { tools_diminta: details.requestedTools } : {}),
      ...(durationMs !== null ? { durasi_inferensi: `${durationMs} ms` } : {}),
    }
  } else if (!output && log.step === "guard") {
    output = { status, alasan: summary ?? log.message }
  }

  return { title, description, code: toolName || log.step, isError, durationMs, input, output }
}

const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Jakarta",
})

/** Jam log (WIB, zona tetap agar render server = client). */
export function formatLogTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "—" : timeFormatter.format(date)
}
