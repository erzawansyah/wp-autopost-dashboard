-- =============================================================================
-- Panitera · Selaraskan skill sistem `anti-ai-editor` dengan paket gaya prompt (ADR-069)
-- =============================================================================
-- Sejak ADR-069 aturan gaya per bahasa (`src/core/shared/prompts/system-style-*.md`) disisipkan ke system
-- prompt SEMUA mode. Skill `anti-ai-editor` (hanya dimuat Deep Agent) kini berisi ALUR audit & perbaikan
-- naskah yang merujuk aturan gaya tersebut, bukan salinan aturan yang dulu bertentangan dengan prompt
-- (negasi kontrastif, panjang paragraf, tanda pisah).
--
-- Sumber tunggal isi skill sistem ini adalah migrasi ini (seed tidak lagi menyisipkannya). Upsert pada
-- indeks unik parsial `agent_skills_system_slug_key` (slug, where is_system): instalasi baru membuat
-- baris, production MENIMPA isi lama (skill sistem baca-saja bagi pengguna; tenant yang ingin versi lain
-- membuat skill kustom). Idempoten: menjalankan ulang menghasilkan isi yang sama.
-- =============================================================================

insert into public.agent_skills (user_id, name, slug, description, content, is_system)
values (
  null,
  'anti-ai-editor',
  'anti-ai-editor',
  'Use when drafting or revising the final article: a step-by-step audit that finds and repairs AI writing fingerprints with the writing-style rules from the system prompt, without changing any fact.',
  $skill$---
name: anti-ai-editor
description: Use when drafting or revising the final article: a step-by-step audit that finds and repairs AI writing fingerprints with the writing-style rules from the system prompt, without changing any fact.
---

# Anti-AI Editor

An editing procedure that makes a draft read like a human editor wrote it: direct, specific, and free of
AI writing fingerprints. The rules themselves live in the **WRITING STYLE** section of your system prompt
(written for the article language). This skill tells you how to apply them. It never overrides the
guardrails on facts, sources, safety, or WordPress structure.

## When to use

- Before drafting: skim the WRITING STYLE section so the first draft already follows it.
- After drafting, before the final answer: run the full audit below once.
- When the user asks for a more natural, human, or "less AI-sounding" style.

## Audit and repair (run in order)

1. **Scan the opening.** The first two sentences must answer the core question with the main keyword.
   Delete any meta announcement, scene-setting, or definition opener and start from the substance.
2. **Scan for fingerprints.** Go section by section and mark every pattern listed under
   "AI fingerprints to avoid" (or its equivalent in the article language): mechanical connectors,
   cliché openings and closings, empty phrases, figurative clichés, contrastive negation beyond the
   single allowed use, automatic triads, inflated adjectives, stacked hedges, interpretive tails,
   rhetorical-question strings, dashes used as connectors, scattered bold.
3. **Measure rhythm.** In each section, find three or more consecutive sentences of similar length and
   paragraphs that open with the same pattern. Split, merge, or reorder them.
4. **Rewrite, do not decorate.** Replace each marked phrase with a specific statement (a sourced figure,
   a named example, a concrete step) or delete the sentence if it adds no information. Never replace a
   cliché with a synonym cliché.
5. **Check substance per section.** Every section needs at least one specific detail. If a section has
   none and the research material cannot supply one, shorten the section instead of padding it.
6. **Verify facts are untouched.** Compare figures, dates, names, quotes, and sources against the draft
   before editing. Style edits must not add, remove, round, or alter any of them.
7. **Read as the reader.** Read the opening and the last section once more: the opening gets to the
   point immediately, and the ending gives a concrete implication, decision, or next step.

## Final check

- No meta opening, recap closing, or listed fingerprint remains.
- Contrastive negation appears at most once; no em or en dashes connect clauses.
- Sentence length and paragraph openings vary within every section.
- Every section contains at least one specific detail.
- No new fact, figure, or quote was introduced by the edit.
$skill$,
  true
)
on conflict (slug) where is_system
do update set
  name = excluded.name,
  description = excluded.description,
  content = excluded.content;
