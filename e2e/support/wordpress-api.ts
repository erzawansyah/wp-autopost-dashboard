/**
 * Klien REST WordPress untuk VERIFIKASI di test (bukan bagian aplikasi): membaca state situs Playground
 * langsung dengan Application Password admin, independen dari kode Panitera yang diuji.
 */

export interface WordPressCredentials {
  url: string
  username: string
  appPassword: string
}

export interface WordPressPost {
  id: number
  status: string
  link: string
  title: { raw?: string; rendered: string }
  content: { raw?: string; rendered: string }
  categories: number[]
}

export interface WordPressCategory {
  id: number
  name: string
  slug: string
}

function authHeader(credentials: WordPressCredentials): string {
  return `Basic ${Buffer.from(`${credentials.username}:${credentials.appPassword}`).toString("base64")}`
}

async function wpGet(credentials: WordPressCredentials, route: string, authenticated = true): Promise<Response> {
  return fetch(`${credentials.url}/wp-json${route}`, {
    headers: authenticated ? { Authorization: authHeader(credentials) } : {},
    signal: AbortSignal.timeout(15_000),
  })
}

/** Post apa pun statusnya (draft butuh `context=edit` + autentikasi). */
export async function getWordPressPost(credentials: WordPressCredentials, id: number): Promise<WordPressPost> {
  const response = await wpGet(credentials, `/wp/v2/posts/${id}?context=edit`)
  if (!response.ok) throw new Error(`GET post ${id} gagal: HTTP ${response.status}`)
  return (await response.json()) as WordPressPost
}

/** Status HTTP saat post dibaca TANPA autentikasi (draft → 401). */
export async function publicPostStatus(credentials: WordPressCredentials, id: number): Promise<number> {
  return (await wpGet(credentials, `/wp/v2/posts/${id}`, false)).status
}

export async function listWordPressCategories(credentials: WordPressCredentials): Promise<WordPressCategory[]> {
  const response = await wpGet(credentials, "/wp/v2/categories?per_page=100")
  if (!response.ok) throw new Error(`GET categories gagal: HTTP ${response.status}`)
  return (await response.json()) as WordPressCategory[]
}
