/**
 * Okaro — Full orchestrator v2
 *
 * Wires the complete closed loop:
 *   idea → parallel SCAMPER → human gate → cross-source evidence →
 *   artifact routing → field data → metrics → back to idea
 *
 * This is the composition layer. Individual modules stay dumb and testable.
 */

import { runParallelScamper, mergeAnglePools, DEFAULT_FRAMINGS, type Framing } from ".//skills/parallelScamper";
import { openAlexBatchSearch } from ".//connectors/openalex";
import { crossrefBatchSearch } from ".//connectors/crossref";
import { pubmedBatchSearch } from ".//connectors/pubmed";
import { mergeEvidence, evidenceCoverageRate, type SourceMatrix } from ".//agents/evidenceMerge";
import { routeArtifact, type ArtifactDecision } from ".//agents/artifactRouter";
import { ingestFieldSession, type FieldSession } from ".//agents/fieldDataIngestion";
import { createMetricsStore, type CycleMetrics } from ".//metrics/cycleMetrics";
import { briefToOutlineSeed, seedToPipelineInput } from ".//bridges/outlineBridge";

export type CycleInput = {
  idea: string;
  framings?: Framing[];
  field_session?: Partial<FieldSession> & { samples: FieldSession["samples"] };
  field_provenance?: FieldSession["provenance"];
  // Human review: list of accepted lens IDs (from the merged session)
  accepted_lenses: string[];
}

export type CycleResult = {
  merged_session_id: string;
  total_angles: number;
  accepted_count: number;
  evidence: ReturnType<typeof mergeEvidence>;
  coverage_rate: number;
  artifact: ArtifactDecision;
  field_ingestion: ReturnType<typeof ingestFieldSession> | null;
  outline_seed: any | null;
  metrics: CycleMetrics;
  status: "complete" | "blocked_at_gate" | "blocked_no_evidence";
}

const metrics = createMetricsStore();

export async function runCycle(input: CycleInput, iteration = 1): Promise<CycleResult> {
  // 1. Parallel SCAMPER
  const framingResults = await runParallelScamper(input.idea, input.framings ?? DEFAULT_FRAMINGS);
  const merged = mergeAnglePools(framingResults);

  // 2. Human gate (simulated here — in production this blocks for real input)
  const accepted = merged.angles.filter((a) => input.accepted_lenses.includes(a.lens));
  if (!accepted.length) {
    return {
      merged_session_id: merged.id,
      total_angles: merged.angles.length,
      accepted_count: 0,
      evidence: [],
      coverage_rate: 0,
      artifact: null as any,
      field_ingestion: null,
      outline_seed: null,
      metrics: { iteration, timestamp: new Date().toISOString(), evidence_coverage_rate: 0, accepted_angles: 0, high_weight_citations: 0, flagged_citations: 0, clean_biomarker_samples: 0, quarantined_sessions: 0, artifacts_produced: 0, trend: "insufficient_data" },
      status: "blocked_at_gate",
    };
  }

  // 3. Cross-source evidence (OpenAlex + Crossref + PubMed in parallel)
  const queries = accepted.map((a) => a.angle);
  const [oa, cr, pm] = await Promise.all([
    openAlexBatchSearch(queries).catch(() => [] as any[][]),
    crossrefBatchSearch(queries).catch(() => [] as any[][]),
    pubmedBatchSearch(queries).catch(() => [] as any[][]),
  ]);

  const matrices: SourceMatrix[] = [];
  accepted.forEach((a, i) => {
    if (oa[i]) matrices.push({ lens: a.lens, angle: a.angle, items: oa[i].map(mapOA), source: "openalex", total: oa[i].length });
    if (cr[i]) matrices.push({ lens: a.lens, angle: a.angle, items: cr[i].map(mapCR), source: "crossref", total: cr[i].length });
    if (pm[i]) matrices.push({ lens: a.lens, angle: a.angle, items: pm[i].map(mapPM), source: "pubmed", total: pm[i].length });
  });
  const evidence = mergeEvidence(matrices);
  const coverage = evidenceCoverageRate(evidence);

  if (coverage === 0) {
    const m: CycleMetrics = { iteration, timestamp: new Date().toISOString(), evidence_coverage_rate: 0, accepted_angles: accepted.length, high_weight_citations: 0, flagged_citations: evidence.reduce((n, e) => n + e.flagged.length, 0), clean_biomarker_samples: 0, quarantined_sessions: 0, artifacts_produced: 0, trend: metrics.trend() };
    metrics.add(m);
    return { merged_session_id: merged.id, total_angles: merged.angles.length, accepted_count: accepted.length, evidence, coverage_rate: 0, artifact: null as any, field_ingestion: null, outline_seed: null, metrics: m, status: "blocked_no_evidence" };
  }

  // 4. Artifact routing
  const dominantFraming = input.framings?.find((f) => f.id === "data-first") ? "data-first" : undefined;
  const hasHardware = accepted.some((a) => /hardware|3d|print|device|sensor/i.test(a.angle));
  const artifact = routeArtifact(evidence, { dominant_framing: dominantFraming, has_hardware_angle: hasHardware });

  // 5. Field data (optional)
  let fieldIngestion = null;
  if (input.field_session && input.field_provenance) {
    fieldIngestion = ingestFieldSession(input.field_session, input.field_provenance);
  }

  // 6. Outline seed (only for paper artifacts)
  let outlineSeed = null;
  if (artifact.type === "paper") {
    const brief = {
      research_question: input.idea,
      background: accepted.map((a) => a.angle).join(" "),
      objectives: accepted.map((a) => `Explore ${a.lens}: ${a.angle}`),
      citations: evidence.flatMap((e) => e.high_weight.map((i) => ({ doi: i.doi, title: i.title, url: i.url }))),
    };
    outlineSeed = briefToOutlineSeed(brief as any);
  }

  const m: CycleMetrics = {
    iteration,
    timestamp: new Date().toISOString(),
    evidence_coverage_rate: coverage,
    accepted_angles: accepted.length,
    high_weight_citations: evidence.reduce((n, e) => n + e.high_weight.length, 0),
    flagged_citations: evidence.reduce((n, e) => n + e.flagged.length, 0),
    clean_biomarker_samples: fieldIngestion?.session.samples.length ?? 0,
    quarantined_sessions: fieldIngestion && !fieldIngestion.training_ready ? 1 : 0,
    artifacts_produced: 1,
    trend: metrics.trend(),
  };
  metrics.add(m);

  return {
    merged_session_id: merged.id,
    total_angles: merged.angles.length,
    accepted_count: accepted.length,
    evidence,
    coverage_rate: coverage,
    artifact,
    field_ingestion: fieldIngestion,
    outline_seed: outlineSeed ? seedToPipelineInput(outlineSeed) : null,
    metrics: m,
    status: "complete",
  };
}

export function getMetrics() { return metrics.summary(); }

// ── mappers ─────────────────────────────────────────────────────
function mapOA(item: any) { return { doi: item.doi, title: item.title, abstract: item.abstract, url: item.url, year: item.year, authors: item.authors ?? [], citations: item.citations ?? 0 }; }
function mapCR(item: any) { return { doi: item.doi, title: item.title, abstract: item.abstract, url: item.url, year: item.year, authors: item.authors ?? [], citations: item.citations ?? 0 }; }
function mapPM(item: any) { return { doi: item.doi, title: item.title, abstract: item.abstract, url: item.url, year: item.year, authors: item.authors ?? [], citations: item.citations ?? 0 }; }
