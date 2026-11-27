/**
 * Okaro — Cross-source evidence merge
 *
 * Takes result matrices from OpenAlex, Crossref, PubMed and merges them
 * into a single weighted evidence matrix. 3+ sources = high weight.
 * Disagreement between sources is preserved as signal, not averaged away.
 */

export type EvidenceItem = {
  doi: string | null;
  title: string;
  abstract: string | null;
  url: string;
  year: number | null;
  authors: string[];
  citations: number;
  sources: string[]; // which connectors returned it
  weight: number;    // 0-1, based on source count + citation rank
  disagreement_flag: boolean; // true if sources conflict on key claims
  lens: string;
  angle: string;
};

export type SourceMatrix = {
  lens: string;
  angle: string;
  items: EvidenceItem[];
  source: string;
  total: number;
};

export type MergedEvidence = {
  lens: string;
  angle: string;
  items: EvidenceItem[];
  high_weight: EvidenceItem[];   // weight >= 0.6 (2+ sources or strong citations)
  flagged: EvidenceItem[];        // single-source, low confidence
  total_unique: number;
  source_coverage: Record<string, number>;
};

/**
 * Merge matrices from multiple sources for the same lens/angle.
 * Key = normalized DOI (fallback: normalized title).
 */
export function mergeEvidence(matrices: SourceMatrix[]): MergedEvidence[] {
  const byLens = new Map<string, Map<string, EvidenceItem[]>>();

  for (const m of matrices) {
    if (!byLens.has(m.lens)) byLens.set(m.lens, new Map());
    const lensMap = byLens.get(m.lens)!;
    for (const item of m.items) {
      const key = item.doi ? `doi::${item.doi}` : `title::${normalize(item.title)}`;
      const list = lensMap.get(key) ?? [];
      // merge sources if same paper appears from multiple connectors
      const existing = list.find((x) => x.doi === item.doi || normalize(x.title) === normalize(item.title));
      if (existing) {
        if (!existing.sources.includes(m.source)) existing.sources.push(m.source);
        existing.citations = Math.max(existing.citations, item.citations);
        if (item.abstract && !existing.abstract) existing.abstract = item.abstract;
      } else {
        list.push({ ...item, sources: [m.source] });
      }
      lensMap.set(key, list);
    }
  }

  const merged: MergedEvidence[] = [];
  for (const [lens, lensMap] of byLens) {
    const allItems: EvidenceItem[] = [];
    for (const list of lensMap.values()) allItems.push(...list);

    const maxCitations = Math.max(1, ...allItems.map((i) => i.citations));
    for (const item of allItems) {
      const sourceScore = Math.min(item.sources.length / 3, 1); // 3 sources = 1.0
      const citeScore = item.citations / maxCitations;
      item.weight = sourceScore * 0.7 + citeScore * 0.3;
      item.disagreement_flag = item.sources.length === 1 && item.citations < 5;
    }

    allItems.sort((a, b) => b.weight - a.weight);
    const angle = matrices.find((m) => m.lens === lens)?.angle ?? "";
    const coverage: Record<string, number> = {};
    for (const item of allItems) {
      for (const s of item.sources) coverage[s] = (coverage[s] ?? 0) + 1;
    }
    merged.push({
      lens,
      angle,
      items: allItems,
      high_weight: allItems.filter((i) => i.weight >= 0.6),
      flagged: allItems.filter((i) => i.disagreement_flag),
      total_unique: allItems.length,
      source_coverage: coverage,
    });
  }
  return merged;
}

/** Compute the cycle metric: % of accepted angles with >=1 high-weight citation. */
export function evidenceCoverageRate(merged: MergedEvidence[]): number {
  if (!merged.length) return 0;
  const covered = merged.filter((m) => m.high_weight.length > 0).length;
  return covered / merged.length;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}
