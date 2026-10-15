"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useController, useFormContext } from "react-hook-form"
import { ExternalLink, FileCode2 } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card"
import { Checkbox } from "@/components/atoms/checkbox"
import { FieldError, FieldLegend, FieldSet } from "@/components/atoms/field"
import { Label } from "@/components/atoms/label"
import { firstErrorMessage } from "@/components/organisms/agents/form-error"
import { skillsQueries } from "@/lib/api/queries/skills"
import type { AgentProfileFormOutput, AgentProfileFormValues } from "@/lib/validation/agents"
import type { AgentSkillSummary } from "@/types/skills"

interface AgentSkillsSectionProps {
  /** Skill sistem + milik pengguna dari page RSC (initialData `skillsQueries.list()`). */
  initialSkills: AgentSkillSummary[]
}

/** Pilihan modul SKILL.md yang dimuat Deep Agent (hanya relevan untuk mode `deep`). */
export function AgentSkillsSection({ initialSkills }: AgentSkillsSectionProps) {
  const { control } = useFormContext<AgentProfileFormValues, unknown, AgentProfileFormOutput>()
  const { field, fieldState } = useController({ control, name: "skills" })
  const { data: skills } = useQuery({ ...skillsQueries.list(), initialData: initialSkills })
  const errorId = React.useId()
  const errorMessage = firstErrorMessage(fieldState.error)
  const selected = new Set(field.value)

  function toggleSkill(slug: string, checked: boolean) {
    field.onChange(checked ? [...field.value, slug] : field.value.filter((value) => value !== slug))
  }

  return (
    <Card className="gap-4 py-5 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-5">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileCode2 aria-hidden="true" className="size-3.5 text-primary" />
          Skill Registry
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <Button asChild variant="ghost" size="xs" className="text-primary">
            <Link href="/skills" target="_blank" rel="noopener noreferrer">
              Buka registry
              <ExternalLink aria-hidden="true" />
              <span className="sr-only">(tab baru)</span>
            </Link>
          </Button>
          <Badge variant="secondary" className="font-mono">
            {selected.size} aktif
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-5">
        <FieldSet className="gap-2" aria-describedby={errorMessage ? errorId : undefined}>
          <FieldLegend className="sr-only">Skill yang dimuat Deep Agent</FieldLegend>
          {skills.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Belum ada skill yang terdaftar.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {skills.map((skill) => {
                const checkboxId = `skill-${skill.id}`
                return (
                  <li
                    key={skill.id}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 transition-colors has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={selected.has(skill.slug)}
                      onCheckedChange={(checked) => toggleSkill(skill.slug, checked === true)}
                      onBlur={field.onBlur}
                    />
                    <Label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold">
                      {skill.name}
                    </Label>
                    {skill.is_system && (
                      <Badge variant="outline" className="border-primary/30 text-2xs text-primary">
                        Sistem
                      </Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {errorMessage && (
            <FieldError id={errorId} className="text-xs font-medium">
              {errorMessage}
            </FieldError>
          )}
        </FieldSet>
      </CardContent>
    </Card>
  )
}
