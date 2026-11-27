/**
 * Okaro — Artifact router
 *
 * Decides WHAT to write based on the shape of the evidence, not on a fixed template.
 * - Strong evidence (many high-weight items) → formal paper (LaTeX via PaperOrchestra)
 * - Medium evidence + hardware angle → prototype spec (CAD-ready)
 * - Weak/conflicting evidence → gap report
 * - Data-first framing dominant → technical brief for dataset construction
 */

export type ArtifactType = "paper" | "prototype_spec" | "gap_report" | "technical_brief";

export type ArtifactDecision = {
  type: ArtifactType;
  rationale: string;
  evidence_strength: "strong" | "medium" | "weak";
  high_weight_count: number;
  flagged_count: number;
  recommended_next_step: string;
  payload: Record<string, any>;
};

export type MergedEvidenceLite = {
  lens: string;
  angle: string;
  high_weight: any[];
  flagged: any[];
  total_unique: number;
  source_coverage: Record<string, number>;
};

export function routeArtifact(
  merged: MergedEvidenceLite[],
  context: { dominant_framing?: string; has_hardware_angle?: boolean } = {})
: ArtifactDecision {
  const totalHigh = merged.reduce((n, m) => n + m.high_weight.length, 0);
  const totalFlagged = merged.reduce((n, m) => n + m.flagged.length, 0);
  const totalItems = merged.reduce((n, m) => n + m.total_unique, 0);

  const strength: ArtifactDecision["evidence_strength"]
    = totalHigh >= 6 ? "strong" : totalHigh >= 2 ? "medium" : "weak";

  // Rule 1: strong evidence → formal paper
  if (strength === "strong") {
    return {
      type: "paper",
      rationale: `${totalHigh} high-weight citations across ${merged.length} lenses — sufficient for a formal literature-backed paper via PaperOrchestra pipeline.`,
      evidence_strength: strength,
      high_weight_count: totalHigh,
      flagged_count: totalFlagged,
      recommended_next_step: "Feed merged evidence into server/bridges/outlineBridge.ts → PaperOrchestra pipeline.",
      payload: { merged_evidence: merged, seed_type: "evidence_backed" },
    };
  }

  // Rule 2: hardware angle + medium evidence → prototype spec
  if (context.has_hardware_angle && strength === "medium") {
    return {
      type: "prototype_spec",
      rationale: "Hardware-relevant angles with moderate evidence — build spec is more valuable than a thin paper.",
      evidence_strength: strength,
      high_weight_count: totalHigh,
      flagged_count: totalFlagged,
      recommended_next_step: "Generate 3D-printable spec (OpenSCAD/CadQuery) + BOM from accepted angles.",
      payload: { merged_evidence: merged, format: "cadquery_or_openscad" },
    };
  }

  // Rule 3: data-first framing → technical brief
  if (context.dominant_framing === "data-first") {
    return {
      type: "technical_brief",
      rationale: "Data-first framing dominant — the priority is structuring the biomarker dataset, not publishing.",
      evidence_strength: strength,
      high_weight_count: totalHigh,
      flagged_count: totalFlagged,
      recommended_next_step: "Define capture schema + training split from field data ingestion.",
      payload: { merged_evidence: merged, schema: "biomarker_v1" },
    };
  }

  // Rule 4: everything else → gap report
  return {
    type: "gap_report",
    rationale: `Only ${totalHigh} high-weight items out of ${totalItems} — the literature has a real gap. Document it instead of stretching a paper thin.`,
    evidence_strength: strength,
    high_weight_count: totalHigh,
    flagged_count: totalFlagged,
    recommended_next_step: "Write gap report + propose the experiment that would close it.",
    payload: { merged_evidence: merged, gap_analysis: true },
  };
}
