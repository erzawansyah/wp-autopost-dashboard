import { queryOptions } from "@tanstack/react-query"
import { toSkillSummary } from "@/lib/agents/catalog"
import type { AgentSkill } from "@/types/skills"
import { apiFetch } from "../client"
import { queryKeys } from "../query-keys"

/**
 * Query options domain skill (SKILL.md). Daftar = ringkasan (tanpa isi SKILL.md) skill sistem (baca-saja) +
 * skill kustom milik pengguna; page RSC memetakan data service dengan `toSkillSummary` yang sama.
 *
 *   const { data: skills } = useQuery({ ...skillsQueries.list(), initialData: skills })
 */
export const skillsQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.skills.list(),
      queryFn: async ({ signal }) =>
        (await apiFetch<{ skills: AgentSkill[] }>("/api/skills", { signal })).skills.map(toSkillSummary),
    }),
}
