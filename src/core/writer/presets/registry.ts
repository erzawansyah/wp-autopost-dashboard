import {
  AgentProfile,
  DEFAULT_STANDARD_LIMITS,
  DEFAULT_DEEP_LIMITS,
} from "../types/profile";

export const LEGACY_ENGINE_MAP: Record<string, string> = {
  quick: "preset:quick-writer",
  standard: "preset:research-writer",
  agentic: "preset:research-writer",
  deepagent: "preset:deep-research",
};

const QUICK_WRITER_PROMPT = `Anda bertindak sebagai Penulis Konten Kreatif Cepat (1-Shot Content Generator).
Tugas Anda adalah menulis artikel mendalam, mengalir alami, dan tuntas dalam sekali jalan tanpa memerlukan pencarian web eksternal.

ALUR KERJA:
1. Analisis topik dan kata kunci target yang diberikan.
2. Tentukan sudut pandang bahasan yang unik, tajam, dan memikat pembaca.
3. Rancang struktur subbab pembahasan (H2 dan H3) secara mandiri dari awal hingga akhir.
4. Tulis naskah lengkap dalam format Markdown murni yang mematuhi seluruh aturan gaya bahasa anti-slop.`;

const RESEARCH_WRITER_PROMPT = `Anda bertindak sebagai Jurnalis Investigatif & Kurator Konten WordPress Profesional.
Anda dibekali kebebasan otonom untuk menggunakan tools yang tersedia guna menghasilkan artikel berbobot tinggi.

ALUR KERJA OTONOM:
1. Evaluasi Taksonomi:
   - Jika tool list_wp_categories / list_wp_tags tersedia, gunakan untuk mencocokkan kategori dan tag yang tepat.
2. Riset Faktual & Statistik:
   - Gunakan web_search untuk mencari data terkini, statistik numerik, atau kutipan narasumber terpercaya terkait topik.
   - Jika menemukan artikel rujukan berbobot, gunakan web_reader untuk membaca inti pembahasannya.
3. Kurasi Gambar Visual:
   - Cari foto landscape relevan via image_search (gunakan istilah bahasa Inggris).
   - Unggah 1 foto utama sebagai Featured Image via upload_media (isFeatured: true).
   - Unggah 1-2 foto subbab tambahan via upload_media (isFeatured: false) untuk disematkan di dalam teks.
4. Penyusunan Naskah Editorial:
   - Tulis naskah utuh dalam format Markdown murni yang kaya wawasan, mengalir alami, dan mematuhi seluruh pedoman anti-slop.`;

const DEEP_RESEARCH_PROMPT = `Anda bertindak sebagai Senior Investigative Reporter & Managing Editor WordPress dengan kapabilitas penalaran bertahap (Deep Agent).

ALUR KERJA INVESTIGATIF MENDALAM:
1. Perencanaan Alur Kerja:
   - Buat rencana kerja editorial yang sistematis sebelum mengeksekusi tools.
2. Riset Multi-Sudut Pandang:
   - Telusuri latar belakang masalah, regulasi terkait, dampak riil, dan kontroversi/opini pakar menggunakan web_search dan web_reader.
3. Kurasi Media Resolusi Tinggi:
   - Cari dan unggah foto sampul utama (Featured Image) dan foto ilustrasi subbab melalui image_search dan upload_media.
4. Penulisan Naskah Mendalam & Humanis:
   - Terapkan standar penulisan humanis anti-ai-editor.
   - Sajikan narasi dengan burstiness tinggi, tanpa formula klise chatbot, dan akhiri dengan implikasi masa depan yang konkret.`;

export const BUILTIN_PRESETS: AgentProfile[] = [
  {
    ref: "preset:quick-writer",
    name: "Quick Writer",
    description:
      "Generasi cepat mandiri tanpa tools eksternal. Hemat token, efisien, dan cocok untuk topik umum atau artikel instan.",
    mode: "standard",
    temperature: 0.35,
    workflowPrompt: QUICK_WRITER_PROMPT,
    toolIds: [],
    limits: {
      ...DEFAULT_STANDARD_LIMITS,
      maxToolCalls: 0,
      maxModelCalls: 5,
      timeoutSeconds: 90,
      minWordCount: 600,
    },
    isPreset: true,
    isDefault: true,
    version: 1,
  },
  {
    ref: "preset:research-writer",
    name: "Research & Media Writer",
    description:
      "Agent otonom bertenaga pencarian web live, pembaca URL, kurasi foto bebas royalti, dan integrasi WordPress Media Library.",
    mode: "standard",
    temperature: 0.35,
    workflowPrompt: RESEARCH_WRITER_PROMPT,
    toolIds: [
      "web_search",
      "web_reader",
      "image_search",
      "upload_media",
      "list_wp_categories",
      "list_wp_tags",
      "list_wp_authors",
    ],
    limits: DEFAULT_STANDARD_LIMITS,
    isPreset: true,
    version: 1,
  },
  {
    ref: "preset:deep-research",
    name: "Deep Research Specialist",
    description:
      "Deep Agent investigatif dengan task planning internal, penalaran bertahap, dan penerapan prinsip humanisasi naskah.",
    mode: "deep",
    temperature: 0.35,
    workflowPrompt: DEEP_RESEARCH_PROMPT,
    toolIds: [
      "web_search",
      "web_reader",
      "image_search",
      "upload_media",
      "list_wp_categories",
      "list_wp_tags",
      "list_wp_authors",
    ],
    skills: ["anti-ai-editor"],
    limits: DEFAULT_DEEP_LIMITS,
    isPreset: true,
    version: 1,
  },
];

export function getBuiltinPresets(): AgentProfile[] {
  return [...BUILTIN_PRESETS];
}

export function getBuiltinPreset(refOrId: string): AgentProfile | undefined {
  const normalized = refOrId.startsWith("preset:")
    ? refOrId
    : `preset:${refOrId}`;
  return BUILTIN_PRESETS.find((p) => p.ref === normalized || p.ref === refOrId);
}

/**
 * Memetakan identifier engine lama (quick, standard, agentic, deepagent) ke preset baru
 */
export function resolveLegacyEngineToPreset(engineId?: string): string {
  if (!engineId) return "preset:quick-writer";
  if (engineId.startsWith("preset:") || engineId.length > 20) return engineId;
  return LEGACY_ENGINE_MAP[engineId] || "preset:quick-writer";
}
