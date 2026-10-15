import { FileCode2 } from "lucide-react"
import { PageHeader } from "@/components/molecules/page-header"
import { SkillCreateForm } from "@/components/organisms/skills/skill-create-form"
import { PageContainer } from "@/components/templates/page-container"

export const metadata = { title: "Tambah Skill" }

export default function NewSkillPage() {
  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Tambah Skill Baru (SKILL.md)"
        description="Daftarkan pedoman keahlian baru ke Skill Registry untuk memandu riset dan penulisan Deep Agent."
        icon={FileCode2}
        backHref="/skills"
        backLabel="Kembali ke registry"
      />
      <SkillCreateForm />
    </PageContainer>
  )
}
