import { queryOptions } from "@tanstack/react-query"
import { toAgentProfileCatalog } from "@/lib/agents/catalog"
import type { AgentProfileListResponse, AgentToolOption } from "@/types/agents"
import { apiFetch } from "../client"
import { queryKeys } from "../query-keys"

/**
 * Query options domain Agent Profile.
 *
 *   const { data } = useQuery({ ...agentsQueries.list(), initialData: catalog })   // { presets, userProfiles } ringkas
 *   const { data: tools = [] } = useQuery(agentsQueries.tools())                    // katalog tool + eligibilitas BYOK
 *
 * Mutation (buat/ubah/arsipkan) di organism `src/components/organisms/agents/*`, lalu
 * `invalidateQueries({ queryKey: queryKeys.agents.all })`.
 */
export const agentsQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.agents.list(),
      queryFn: async ({ signal }) =>
        toAgentProfileCatalog(await apiFetch<AgentProfileListResponse>("/api/agents", { signal })),
    }),
  tools: (siteId?: string) =>
    queryOptions({
      queryKey: queryKeys.agents.tools(siteId),
      queryFn: async ({ signal }) =>
        (await apiFetch<{ tools: AgentToolOption[] }>("/api/agents/tools", { signal, query: { siteId } })).tools,
    }),
}
