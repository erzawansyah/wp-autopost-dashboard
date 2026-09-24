export interface PromptVariables {
  [key: string]: string | number | boolean | string[] | undefined | null
}

export interface PromptTemplateOptions {
  /**
   * Jika true, baris yang berisi variabel kosong atau tidak didefinisikan akan dihapus secara rapi.
   * Default: true.
   */
  stripEmptyVariables?: boolean
  /**
   * Nilai pengganti jika variabel tidak ditemukan atau bernilai null/undefined.
   * Default: "".
   */
  fallbackValue?: string
}
