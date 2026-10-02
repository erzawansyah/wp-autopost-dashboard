/**
 * Pilihan bahasa yang didukung oleh System Writer AI.
 */

export interface LanguageOption {
  code: string
  name: string
  flag: string
  nativeName: string
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "id", name: "Bahasa Indonesia", flag: "🇮🇩", nativeName: "Bahasa Indonesia" },
  { code: "en", name: "English (US/UK)", flag: "🇺🇸", nativeName: "English" },
  { code: "es", name: "Español (Spanyol)", flag: "🇪🇸", nativeName: "Español" },
  { code: "fr", name: "Français (Prancis)", flag: "🇫🇷", nativeName: "Français" },
  { code: "de", name: "Deutsch (Jerman)", flag: "🇩🇪", nativeName: "Deutsch" },
  { code: "ja", name: "日本語 (Jepang)", flag: "🇯🇵", nativeName: "日本語" },
  { code: "ar", name: "العربية (Arab)", flag: "🇸🇦", nativeName: "العربية" },
  { code: "pt", name: "Português", flag: "🇧🇷", nativeName: "Português" },
  { code: "zh", name: "简体中文 (Mandarin)", flag: "🇨🇳", nativeName: "简体中文" },
  { code: "ms", name: "Bahasa Melayu", flag: "🇲🇾", nativeName: "Bahasa Melayu" },
]

export function getLanguageName(code?: string): string {
  if (!code) return "Bahasa Indonesia"
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === code.toLowerCase())
  return found ? `${found.nativeName} (${found.name})` : code
}

export function getLanguageDisplayName(code?: string): string {
  if (!code) return "Bahasa Indonesia"
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === code.toLowerCase())
  return found ? found.name : code
}
