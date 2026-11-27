/**
 * Okaro — Cycle metrics dashboard
 *
 * Tracks the two numbers that matter per iteration:
 *   1. Evidence coverage rate: % of accepted angles with >=1 high-weight citation
 *   2. Biomarkers captured per cycle (clean samples from field sessions)
 * Both must RISE across iterations or the loop is broken.
 */

export type CycleMetrics = {
  iteration: number;
  timestamp: string;
  evidence_coverage_rate: number;   // 0-1
  accepted_angles: number;
  high_weight_citations: number;
  flagged_citations: number;
  clean_biomarker_samples: number;
  quarantined_sessions: number;
  artifacts_produced: number;
  trend: "rising" | "flat" | "falling" | "insufficient_data";
};

export type MetricsStore = {
  cycles: CycleMetrics[];
  add(m: CycleMetrics): void;
  latest(): CycleMetrics | null;
  trend(): CycleMetrics["trend"];
  summary(): string;
}

export function createMetricsStore(): MetricsStore {
  const cycles: CycleMetrics[] = [];
  return {
    cycles,
    add(m: CycleMetrics) { cycles.push(m); },
    latest() { return cycles[cycles.length - 1] ?? null; },
    trend() {
      if (cycles.length < 2) return "insufficient_data";
      const last = cycles[cycles.length - 1];
      const prev = cycles[cycles.length - 2];
      const dCoverage = last.evidence_coverage_rate - prev.evidence_coverage_rate;
      const dSamples = last.clean_biomarker_samples - prev.clean_biomarker_samples;
      if (dCoverage > 0.05 || dSamples > 0) return "rising";
      if (dCoverage < -0.05 || dSamples < 0) return "falling";
      return "flat";
    },
    summary() {
      if (!cycles.length) return "No cycles recorded yet.";
      const t = this.trend();
      const last = cycles[cycles.length - 1];
      const lines = cycles.map((c, i) =>
        `  iter ${c.iteration}: coverage ${(c.evidence_coverage_rate * 100).toFixed(0)}% | ${c.clean_biomarker_samples} clean samples | ${c.artifacts_produced} artifacts`
      ).join("\n");
      return `Cycle metrics (${cycles.length} iterations) — trend: ${t.toUpperCase()}\n${lines}\n  Latest: ${last.accepted_angles} angles accepted, ${last.high_weight_citations} high-weight citations, ${last.quarantined_sessions} quarantined sessions.`;
    },
  };
}
