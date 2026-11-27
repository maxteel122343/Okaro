/**
 * Okaro Orchestrator v2 — integrated cycle with all three efficacy modules.
 *
 * Pipeline: idea → parallel SCAMPER → lexical cascade → graduated scoring
 * → human gate → multi-source evidence (OpenAlex/Crossref/PubMed)
 * → cross-source merge → MV artifact cards → top-N promotion → metrics.
 */

import { runParallelScamper, type ParallelScamperResult } from "./skills/parallelScamper";
import { filterAngles } from "./filters/lexicalCascade";
import {
  scoreAngle,
  mergeScoredAngles,
  topN as topScored,
  type ScoredAngle,
  type ScoreDimensions,
} from "./scoring/graduatedScoring";
import {
  buildCard,
  selectPromotions,
  type ArtifactCard,
  type EvidenceRef,
} from "./artifacts/minimalViableArtifact";
import { openAlexBatchSearch } from "./connectors/openalex";
import { crossrefBatchSearch } from "./connectors/crossref";
import { pubmedBatchSearch } from "./connectors/pubmed";
import { mergeEvidence } from "./merge/crossSourceMerge";
import { routeArtifacts } from "./routing/artifactRouter";
import { ingestFieldData } from "./ingestion/fieldDataIngestion";

export interface CycleInput {
  idea: string;
  framings?: string[];
  humanScores?: Record<string, ScoreDimensions>; // keyed by lens::angle
  topNPromotions?: number;
  fieldDataBatch?: unknown[];
}

export interface CycleResult {
  id: string;
  idea: string;
  stages: {
    parallelScamper: ParallelScamperResult;
    lexicalFilter: { passed: number; rejected: number };
    scored: ScoredAngle[];
    humanGate: { accepted: number; pending: number };
    evidence: { openalex: number; crossref: number; pubmed: number; merged: number };
    artifacts: { cards: number; promoted: number };
    fieldData: { ingested: number; quarantined: number };
  };
  metrics: {
    anglesGenerated: number;
    anglesAfterLexical: number;
    anglesScored: number;
    anglesAccepted: number;
    evidenceItems: number;
    cardsProduced: number;
    papersPromoted: number;
    cycleEfficiency: number; // accepted/generated ratio
  };
  status: "pending_human_review" | "completed" | "failed";
  error?: string;
}

export async function runCycle(input: CycleInput): Promise<CycleResult> {
  const cycleId = `cycle-${Date.now()}`;
  const result: CycleResult = {
    id: cycleId,
    idea: input.idea,
    stages: {
      parallelScamper: null as any,
      lexicalFilter: { passed: 0, rejected: 0 },
      scored: [],
      humanGate: { accepted: 0, pending: 0 },
      evidence: { openalex: 0, crossref: 0, pubmed: 0, merged: 0 },
      artifacts: { cards: 0, promoted: 0 },
      fieldData: { ingested: 0, quarantined: 0 },
    },
    metrics: {
      anglesGenerated: 0,
      anglesAfterLexical: 0,
      anglesScored: 0,
      anglesAccepted: 0,
      evidenceItems: 0,
      cardsProduced: 0,
      papersPromoted: 0,
      cycleEfficiency: 0,
    },
    status: "pending_human_review",
  };

  try {
    // ── Stage 1: Parallel SCAMPER ──────────────────────────────────
    const parallel = await runParallelScamper({ idea: input.idea });
    result.stages.parallelScamper = parallel;
    result.metrics.anglesGenerated = parallel.mergedAngles.length;

    // ── Stage 2: Lexical cascade (cheap filter before API) ─────────
    const { passed: lexPassed, rejected: lexRejected } = filterAngles(
      parallel.mergedAngles
    );
    result.stages.lexicalFilter = {
      passed: lexPassed.length,
      rejected: lexRejected.length,
    };
    result.metrics.anglesAfterLexical = lexPassed.length;

    // ── Stage 3: Graduated scoring ─────────────────────────────────
    const scored: ScoredAngle[] = lexPassed.map((a) => {
      const key = `${a.lens}::${a.angle}`;
      const humanScore = input.humanScores?.[key];
      const dims: ScoreDimensions = humanScore ?? {
        clarity: 3,
        hardwareFeasibility: 3,
        dataPotential: 3,
        novelty: 3,
      };
      return scoreAngle(a.lens, a.angle, a.rationale, a.framing, dims);
    });
    const merged = mergeScoredAngles(scored);
    result.stages.scored = merged;
    result.metrics.anglesScored = merged.length;

    // ── Stage 4: Human gate ────────────────────────────────────────
    const accepted = merged.filter((a) => a.status === "human_calibrated");
    const pending = merged.filter((a) => a.status !== "human_calibrated");
    result.stages.humanGate = { accepted: accepted.length, pending: pending.length };
    result.metrics.anglesAccepted = accepted.length;

    if (accepted.length === 0) {
      result.status = "pending_human_review";
      result.metrics.cycleEfficiency = 0;
      return result;
    }

    // ── Stage 5: Multi-source evidence (parallel) ───────────────────
    const queries = accepted.map((a) => a.angle.slice(0, 200));
    const [oa, cr, pm] = await Promise.allSettled([
      openAlexBatchSearch(queries),
      crossrefBatchSearch(queries),
      pubmedBatchSearch(queries),
    ]);
    const oaItems = oa.status === "fulfilled" ? oa.value : [];
    const crItems = cr.status === "fulfilled" ? cr.value : [];
    const pmItems = pm.status === "fulfilled" ? pm.value : [];
    result.stages.evidence = {
      openalex: oaItems.length,
      crossref: crItems.length,
      pubmed: pmItems.length,
      merged: 0,
    };

    const mergedEvidence = mergeEvidence([
      { source: "openalex", items: oaItems },
      { source: "crossref", items: crItems },
      { source: "pubmed", items: pmItems },
    ]);
    result.stages.evidence.merged = mergedEvidence.length;
    result.metrics.evidenceItems = mergedEvidence.length;

    // ── Stage 6: MV artifact cards ─────────────────────────────────
    const evidenceByAngle = new Map<string, EvidenceRef[]>();
    for (const a of accepted) {
      const refs: EvidenceRef[] = mergedEvidence
        .filter((e) => e.relevanceTo?.includes(a.lens) || e.queryMatch)
        .slice(0, 3)
        .map((e) => ({
          doi: e.doi ?? "",
          url: e.url ?? "",
          title: e.title ?? "",
          source: e.source,
        }));
      evidenceByAngle.set(a.lens, refs);
    }

    const cards = accepted.map((a) =>
      buildCard(
        a,
        evidenceByAngle.get(a.lens) ?? [],
        `Prototipar com impressão 3D: validar captura de ${a.lens} em bancada`
      )
    );
    result.stages.artifacts.cards = cards.length;
    result.metrics.cardsProduced = cards.length;

    // ── Stage 7: Promote top-N to paper ────────────────────────────
    const topN = input.topNPromotions ?? 3;
    const { promoted, cards: rest } = selectPromotions(cards, topN);
    result.stages.artifacts.promoted = promoted.length;
    result.metrics.papersPromoted = promoted.length;

    const routed = routeArtifacts([...promoted, ...rest]);

    // ── Stage 8: Field data ingestion ──────────────────────────────
    if (input.fieldDataBatch?.length) {
      const ingestion = ingestFieldData(input.fieldDataBatch);
      result.stages.fieldData = {
        ingested: ingestion.ingested,
        quarantined: ingestion.quarantined,
      };
    }

    // ── Metrics ────────────────────────────────────────────────────
    result.metrics.cycleEfficiency = result.metrics.anglesGenerated
      ? result.metrics.anglesAccepted / result.metrics.anglesGenerated
      : 0;
    result.status = "completed";
    return result;
  } catch (err) {
    result.status = "failed";
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }
}

// ── CLI ────────────────────────────────────────────────────────────
if (require.main === module) {
  const idea = process.argv.slice(2).join(" ") || "Hardware de captação de biomarcadores via tinta condutiva impressa em 3D";
  runCycle({ idea, topNPromotions: 3 }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
  });
}
