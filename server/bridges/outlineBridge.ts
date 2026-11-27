/**
 * Okaro — Outline Agent Bridge
 *
 * Takes a PipelineBrief (from orchestrator.ts) and transforms it into
 * the seed input that PaperOrchestra's outline agent expects.
 *
 * The bridge does three things:
 *   1. Flattens validated SCAMPER angles into a structured research question.
 *   2. Injects verified citations as the literature seed (replacing the
 *      hallucinated Google-Search discovery in literatureReviewAgent.ts).
 *   3. Produces a typed OutlineSeed that the existing pipeline can consume
 *      without modification to its internal agent logic.
 *
 * Key rule: the outline agent receives ONLY validated angles and
 * verified DOIs. Raw/unreviewed content never crosses this bridge.
 */

import type { PipelineBrief } from "./";
import type { EvidenceMatrix } from "./";

// ─────────────────────────────────────────────
// Output types (what the outline agent receives)
// ─────────────────────────────────────────────

export interface OutlineSeed {
  research_question: string;
  background: string;
  objectives: string[];
  seed_citations: SeedCitation[];
  constraints: string[];
  metadata: {
    source: "okaro-orchestrator";
    run_id: string;
    scamper_template: string;
    generated_at: string;
    human_reviewed: true;
  };
}

export interface SeedCitation {
  title: string;
  doi: string | null;
  url: string | null;
  cited_by: number;
  lens: string;
}

// ─────────────────────────────────────────────
// Bridge: PipelineBrief → OutlineSeed
// ─────────────────────────────────────────────

/**
 * Convert a completed orchestrator brief into an outline seed.
 * Throws if the brief is incomplete or contains unverified data.
 */
export function briefToOutlineSeed(
  brief: PipelineBrief,
  runId: string,
): OutlineSeed {
  // Guard: only validated angles may enter
  if (!brief.validated_angles.length) {
    throw new Error("Brief has no validated angles — outline seed refused");
  }

  // Guard: every evidence entry must be verified
  for (const ev of brief.evidence) {
    if (ev.total_verified === 0) {
      throw new Error(
        `Lens ${ev.lens} has zero verified sources — outline seed refused`,
      );
    }
  }

  const research_question = buildResearchQuestion(brief);
  const background = buildBackground(brief);
  const objectives = buildObjectives(brief);
  const seed_citations = flattenCitations(brief);
  const constraints = buildConstraints(brief);

  return {
    research_question,
    background,
    objectives,
    seed_citations,
    constraints,
    metadata: {
      source: "okaro-orchestrator",
      run_id: runId,
      scamper_template: brief.template_versions.scamper,
      generated_at: brief.generated_at,
      human_reviewed: true,
    },
  };
}

// ─────────────────────────────────────────────
// Transformation helpers
// ─────────────────────────────────────────────

function buildResearchQuestion(brief: PipelineBrief): string {
  const angleSummary = brief.validated_angles
    .map((a) => `${a.lens_name}: ${a.angle}`)
    .join("; ");
  return `${brief.idea} — explored through validated SCAMPER angles: ${angleSummary}`;
}

function buildBackground(brief: PipelineBrief): string {
  const parts = brief.validated_angles.map((a) => {
    const ev = brief.evidence.find((e) => e.lens === a.lens);
    const citeCount = ev?.total_verified ?? 0;
    return (
      `[${a.lens_name}] ${a.angle} ` +
      `(${citeCount} verified sources in OpenAlex)`
    );
  });
  return parts.join("\n");
}

function buildObjectives(brief: PipelineBrief): string[] {
  return brief.validated_angles.map(
    (a) => `Investigate the ${a.lens_name} angle: ${a.angle}`,
  );
}

function flattenCitations(brief: PipelineBrief): SeedCitation[] {
  const citations: SeedCitation[] = [];
  for (const ev of brief.evidence) {
    for (const c of ev.top_citations) {
      citations.push({
        title: c.title,
        doi: c.doi,
        url: c.url,
        cited_by: c.cited_by,
        lens: ev.lens,
      });
    }
  }
  // Dedupe by DOI
  const seen = new Set<string>();
  return citations.filter((c) => {
    const key = c.doi ?? c.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildConstraints(brief: PipelineBrief): string[] {
  return [
    "All citations must come from the seed_citations list — no external discovery.",
    "Every claim in the outline must map to at least one seed citation.",
    "Angles marked human-reviewed only; raw SCAMPER output excluded.",
    `SCAMPER template version: ${brief.template_versions.scamper}`,
  ];
}

// ─────────────────────────────────────────────
// Adapter: OutlineSeed → PaperOrchestra pipeline input shape
 *
 * PaperOrchestra's outline agent reads a topic string + optional
 * background. This adapter produces that minimal surface while
 * carrying the full seed as structured metadata for downstream agents.
 */
export function seedToPipelineInput(seed: OutlineSeed): {
  topic: string;
  background: string;
  _okaro_metadata: OutlineSeed["metadata"] & {
    objectives: string[];
    seed_citations: SeedCitation[];
    constraints: string[];
  };
} {
  return {
    topic: seed.research_question,
    background: seed.background,
    _okaro_metadata: {
      ...seed.metadata,
      objectives: seed.objectives,
      seed_citations: seed.seed_citations,
      constraints: seed.constraints,
    },
  };
}
