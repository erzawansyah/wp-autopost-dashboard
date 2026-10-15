import { notFound } from "next/navigation"
import { FileCode2, Lock } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { JsonCodeViewer } from "@/components/molecules/json-code-viewer"
import { MarkdownPreview } from "@/components/molecules/markdown-preview"
import { PageHeader } from "@/components/molecules/page-header"
import { SkillEditForm } from "@/components/organisms/skills/skill-edit-form"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { IdParamsSchema } from "@/lib/validation/common"
import { findSkill } from "@/server/services/skills"

export const metadata = { title: "Detail Skill" }

interface SkillDetailPageProps {
  params: Promise<{ id: string }>
}

/** Skill kustom → form edit; skill sistem → tampilan baca-saja (tanpa aksi ubah/hapus). */
export default async function SkillDetailPage({ params }: SkillDetailPageProps) {
  const parsed = IdParamsSchema.safeParse(await params)
  if (!parsed.success) notFound()

  const { supabase, user } = await requireSession()
  const skill = await findSkill(supabase, user.id, parsed.data.id)
  if (!skill) notFound()

  return (
    <PageContainer size="narrow">
      <PageHeader
        title={skill.is_system ? skill.name : `Edit Skill: ${skill.name}`}
        description={skill.description || "Pedoman keahlian SKILL.md untuk Agent Profile mode Deep."}
        icon={FileCode2}
        backHref="/skills"
        backLabel="Kembali ke registry"
        badge={
          <Badge variant="outline" className="font-mono text-2xs">
            {skill.slug}
          </Badge>
        }
      />
      {skill.is_system ? (
        <>
          <Alert variant="info" role="note">
            <Lock aria-hidden="true" />
            <AlertDescription>
              Skill sistem bawaan bersifat baca-saja. Buat skill baru bila ingin menyesuaikan pedomannya.
            </AlertDescription>
          </Alert>
          <MarkdownPreview content={skill.content} />
          <JsonCodeViewer title="Isi SKILL.md (mentah)" data={skill.content} rawText maxHeight="max-h-96" />
        </>
      ) : (
        <SkillEditForm
          skill={{ id: skill.id, name: skill.name, slug: skill.slug, description: skill.description, content: skill.content }}
        />
      )}
    </PageContainer>
  )
}
