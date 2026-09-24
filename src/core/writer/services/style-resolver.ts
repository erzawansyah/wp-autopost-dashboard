import fs from "fs"
import path from "path"

/**
 * Service untuk memuat dan mengelola aturan gaya bahasa penulisan (Style Rules)
 * Berkas disimpan di src/core/writer/styles/
 */
export class StyleRuleResolver {
  private static STYLES_DIR = path.join(process.cwd(), "src/core/writer/styles")

  /**
   * Mengambil konten instruksi gaya bahasa berdasarkan nama style.
   * Mendukung nama seperti 'default', 'listicle', 'essay', 'how-to-tutorial', 'in-depth-review'.
   */
  static getStyleInstruction(styleName: string = "default"): string {
    const cleanName = styleName.toLowerCase().replace(/[^a-z0-9_-]/g, "")
    const targetFile = path.join(this.STYLES_DIR, `${cleanName}.md`)

    if (fs.existsSync(targetFile)) {
      try {
        return fs.readFileSync(targetFile, "utf-8")
      } catch (err) {
        console.warn(`[StyleRuleResolver] Gagal membaca style file: ${targetFile}`, err)
      }
    }

    // Fallback ke default.md jika file spesifik tidak ditemukan
    const defaultFile = path.join(this.STYLES_DIR, "default.md")
    if (fs.existsSync(defaultFile)) {
      try {
        return fs.readFileSync(defaultFile, "utf-8")
      } catch {
        // Fallback hardcoded dasar jika filesystem tidak dapat diakses
      }
    }

    return "Tulis artikel secara informatif, lugas, mengalir wajar, dan tuntas dengan minimal 3 subheading H2."
  }

  /**
   * Mengembalikan daftar semua style yang tersedia untuk formulir UI
   */
  static listAvailableStyles(): Array<{ id: string; name: string }> {
    if (!fs.existsSync(this.STYLES_DIR)) {
      return [{ id: "default", name: "Standar Informatif" }]
    }

    try {
      const files = fs.readdirSync(this.STYLES_DIR).filter((f) => f.endsWith(".md"))
      return files.map((file) => {
        const id = file.replace(/\.md$/, "")
        const formattedName = id
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ")
        return { id, name: formattedName }
      })
    } catch {
      return [{ id: "default", name: "Standar Informatif" }]
    }
  }
}
