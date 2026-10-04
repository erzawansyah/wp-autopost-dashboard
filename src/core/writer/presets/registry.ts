import fs from "fs";
import path from "path";
import {
  AgentProfile,
  DEFAULT_STANDARD_LIMITS,
  DEFAULT_DEEP_LIMITS,
  MANDATORY_TOOL_IDS,
} from "../types/profile";

export const LEGACY_ENGINE_MAP: Record<string, string> = {
  quick: "preset:quick-writer",
  standard: "preset:research-writer",
  agentic: "preset:research-writer",
  deepagent: "preset:deep-research",
};

export function loadPromptFile(filename: string, fallback: string): string {
  try {
    const p = path.join(process.cwd(), "src", "core", "shared", "prompts", filename);
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf-8").trim();
    }
  } catch (err) {
    console.warn(`[presets/registry] Gagal membaca ${filename} dari disk:`, err);
  }
  return fallback.trim();
}

const QUICK_WRITER_PROMPT = `Anda bertindak sebagai Penulis Konten Kreatif Cepat (1-Shot Content Generator).
Tugas Anda adalah menulis artikel yang komprehensif, mengalir alami, dan tuntas dalam sekali eksekusi tanpa memerlukan alat riset eksternal.

ALUR KERJA PENULISAN CEPAT:
1. Hook Pembuka Konkret:
   - Buka tulisan secara langsung dengan masalah nyata, fakta menarik, atau skenario praktis yang relevan dengan topik.
   - Hindari pembuka klise seperti definisi kamus umum atau basa-basi kosong.
2. Pengembangan Struktur Tematik (H2 & H3):
   - Rancang minimal 5 subbab deskriptif yang memiliki benang merah logis (misalnya: membedah masalah, analisis penyebab/faktor kunci, komparasi solusi, panduan langkah praktis, dan antisipasi kendala).
   - Setiap subbab wajib dikembangkan secara mendalam dengan beberapa paragraf penjelasan berbobot, contoh nyata, atau tips aplikatif.
3. Gaya Bahasa Alami & Mengalir:
   - Gunakan bahasa yang hidup, komunikatif, dan bervariasi dalam panjang kalimat agar nyaman dibaca.
   - Hindari formula klise AI dan jangan menggunakan subbab kaku seperti "Kesimpulan" atau "Penutup".
4. Penutup Berdampak:
   - Akhiri artikel dengan kesimpulan kontekstual, rekomendasi langkah konkret berikutnya, atau pandangan ke depan yang memberdayakan pembaca.`;

const RESEARCH_WRITER_PROMPT = `Anda bertindak sebagai Jurnalis Investigatif & Kurator Konten WordPress Profesional.
Anda memiliki kebebasan otonom untuk menggunakan tools yang tersedia guna menghasilkan artikel faktual, kaya data, dan berdaya tarik visual tinggi.

ALUR KERJA OTONOM:
1. Riset Data & Fakta Terkini:
   - Gunakan \`web_search\` dengan kata kunci pencarian yang spesifik untuk mencari data statistik terkini, regulasi resmi, studi kasus, atau kutipan pakar.
   - Jika menemukan artikel rujukan atau laporan yang sangat berbobot, gunakan \`web_reader\` untuk membaca intisari pembahasannya.
   - Formulasikan temuan riset langsung ke dalam kalimat naratif naskah (sebutkan nama lembaga atau narasumbernya secara alami).
2. Kurasi Media Visual:
   - Cari foto yang relevan dengan topik menggunakan \`image_search\` (gunakan kata kunci visual bahasa Inggris agar hasil fotonya estetik).
   - Siapkan 1 foto terbaik sebagai gambar sampul utama (Featured Image), serta 1–2 foto pendukung untuk mempercantik subbab artikel.
3. Penyusunan Naskah & Integrasi Media:
   - Rancang minimal 5 subbab tematik (H2/H3) yang membahas topik secara komprehensif, mengalir alami, dan faktual.
   - Sematkan foto pendukung yang diperoleh ke dalam subbab artikel yang relevan beserta takarir (caption) deskriptif.
4. Finalisasi Format:
   - Pastikan seluruh konten menggunakan Markdown murni dan kembalikan output JSON terstruktur lengkap dengan judul memikat dan ringkasan (excerpt).`;

const DEEP_RESEARCH_PROMPT = `Anda bertindak sebagai Senior Investigative Reporter & Managing Editor WordPress dengan kapabilitas penalaran bertahap (Deep Agent).
Tugas Anda adalah membedah topik secara multidimensi, melakukan verifikasi data silang, dan menghasilkan karya jurnalistik yang berbobot tinggi serta humanis.

ALUR KERJA INVESTIGATIF MENDALAM:
1. Perencanaan Investigasi (Planning):
   - Identifikasi pilar-pilar penting bahasan: latar belakang masalah, data riil lapangan, regulasi/kebijakan, perdebatan perspektif, dan implikasi solusi.
2. Investigasi Multi-Sudut Pandang:
   - Lakukan penelusuran bertahap menggunakan \`web_search\` untuk mengumpulkan bukti empiris, statistik industri, dan studi komparatif.
   - Gunakan \`web_reader\` untuk mendalami dokumen sumber primer, whitepaper, atau wawancara mendalam.
   - Lakukan verifikasi silang: jika terdapat klaim yang bertolak belakang, jelaskan kedua sudut pandang secara adil dan objektif.
3. Kurasi Media Editorial:
   - Cari foto yang memiliki kekuatan visual jurnalistik via \`image_search\` (gunakan kata kunci visual bahasa Inggris).
   - Siapkan 1 foto utama paling memikat sebagai gambar sampul (Featured Image), serta 1–2 foto pendukung untuk memperkuat subbab analisis naskah.
4. Penulisan Naskah Humanis & Mendalam:
   - Terapkan standar penulisan humanis (anti-ai-editor): variasi ritme kalimat tinggi, narasi kaya detail inderawi dan analogi tajam, tanpa pengulangan kata robotik.
   - Rancang minimal 5–7 subbab deskriptif yang mengalir tuntas dan sematkan foto pendukung pada bagian yang relevan.
   - Tutup artikel dengan analisis implikasi jangka panjang, prediksi tren, atau rekomendasi strategis yang aplikatif.`;

export function getPresetPrompts() {
  return {
    quick: loadPromptFile("preset-quick-writer.md", QUICK_WRITER_PROMPT),
    research: loadPromptFile("preset-research-writer.md", RESEARCH_WRITER_PROMPT),
    deep: loadPromptFile("preset-deep-research.md", DEEP_RESEARCH_PROMPT),
  };
}

export const BUILTIN_PRESETS: AgentProfile[] = [
  {
    ref: "preset:quick-writer",
    name: "Quick Writer",
    description:
      "Generasi cepat mandiri tanpa tools eksternal. Hemat token, efisien, dan cocok untuk topik umum atau artikel instan.",
    mode: "standard",
    temperature: 0.35,
    get workflowPrompt() {
      return loadPromptFile("preset-quick-writer.md", QUICK_WRITER_PROMPT);
    },
    toolIds: [...MANDATORY_TOOL_IDS],
    limits: {
      ...DEFAULT_STANDARD_LIMITS,
      maxToolCalls: 4,
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
    get workflowPrompt() {
      return loadPromptFile("preset-research-writer.md", RESEARCH_WRITER_PROMPT);
    },
    toolIds: [
      "keyword_suggestions",
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
    get workflowPrompt() {
      return loadPromptFile("preset-deep-research.md", DEEP_RESEARCH_PROMPT);
    },
    toolIds: [
      "keyword_suggestions",
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
