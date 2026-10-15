import Link from "next/link"
import { FileCode2, Plus, Sparkles } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { PageHeader } from "@/components/molecules/page-header"
import { SkillRegistry } from "@/components/organisms/skills/skill-registry"
import { PageContainer } from "@/components/templates/page-container"
import { toSkillSummary } from "@/lib/agents/catalog"
import { requireSession } from "@/lib/auth/session"
import { listSkills } from "@/server/services/skills"

export const metadata = { title: "Skill Registry" }

export default async function SkillsPage() {
  const { supabase, user } = await requireSession()
  const skills = (await listSkills(supabase, user.id)).map(toSkillSummary)

  return (
    <PageContainer>
      <PageHeader
        title="Skill Registry"
        description="Kelola berkas keahlian (SKILL.md) yang dimuat Agent Profile mode Deep untuk memandu riset, gaya bahasa, dan metodologi penulisan."
        icon={FileCode2}
        actions={
          <Button asChild size="sm">
            <Link href="/skills/new">
              <Plus aria-hidden="true" />
              Tambah Skill Baru
            </Link>
          </Button>
        }
      />
      <Alert variant="ai" role="note">
        <Sparkles aria-hidden="true" />
        <AlertTitle>Cara kerja skill pada Deep Agent</AlertTitle>
        <AlertDescription>
          Setiap berkas SKILL.md mendefinisikan persona, panduan editorial, atau metodologi. Saat Agent Profile bermode
          Deep dijalankan, skill yang dicentang di profil tersebut dimuat ke direktori kerja virtual agen.
        </AlertDescription>
      </Alert>
      <SkillRegistry initialSkills={skills} />
    </PageContainer>
  )
}
