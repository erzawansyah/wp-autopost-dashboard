import { notFound } from "next/navigation"
import { PostDetailView } from "@/components/organisms/post-detail/post-detail-view"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { UuidSchema } from "@/lib/validation/common"
import { getPostDetail } from "@/server/services/posts"

export const metadata = { title: "Detail Artikel" }

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UuidSchema.safeParse(id).success) notFound()

  const { supabase, user } = await requireSession()
  const detail = await getPostDetail(supabase, user.id, id)
  if (!detail) notFound()

  // Header ada di organism: judul & aksi berubah live (judul terisi saat naskah selesai).
  return (
    <PageContainer>
      <PostDetailView initialData={detail} />
    </PageContainer>
  )
}
