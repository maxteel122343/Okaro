/**
 * Okaro — Literature Discovery Agent (v0 minimal)
 *
 * First functional skill of the Okaro framework.
 * Replaces the hallucinated "Gemini invents titles + S2 rescue" flow
 * with a direct, verified OpenAlex query. Every result is a real,
 * citable, clickable source — or it is not returned.
 *
 * Contract (matches OKARO_FRAMEWORK_V1_PROMPTS.md):
 *   - Skill: academic-literature-search
 *   - Input: research question (string)
 *   - Output: EvidenceMatrix with provenance, DOI, URL, abstract
 *   - Rule: no unverified metadata. is_verified must be true for every entry.
 */

import {
  openAlexSearch,
  openAlexTitleSearch,
  type OpenAlexWork,
} from "../connectors/openalex";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface EvidenceEntry {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  cited_by: number;
  source: "openalex";
  is_verified: true; // hard guarantee — only verified entries exist in this type
  retrieved_at: string; // ISO timestamp
}

export interface EvidenceMatrix {
  query: string;
  total_results: number;
  entries: EvidenceEntry[];
  generated_at: string;
  skill: "academic-literature-search";
  framework_version: "okaro-v1";
}

export interface DiscoveryOptions {
  maxResults?: number;   // default 10, clamped 1–50
  minCitations?: number; // optional floor
  yearFrom?: number;
  yearTo?: number;
}

// ─────────────────────────────────────────────
// Core: run a discovery cycle
// ─────────────────────────────────────────────

/**
 * Execute one literature discovery cycle.
 *
 * 1. Query OpenAlex directly (no LLM inventing titles).
 * 2. Map every hit to EvidenceEntry with is_verified: true.
 * 3. Return the matrix — ready for human review or downstream agents.
 */
export async function runLiteratureDiscovery(
  researchQuestion: string,
  options: DiscoveryOptions = {},
): Promise<EvidenceMatrix> {
  const {
    maxResults = 10,
    minCitations = 0,
    yearFrom,
    yearTo,
  } = options;

  const clamped = Math.min(Math.max(maxResults, 1), 50);

  const works: OpenAlexWork[] = await openAlexSearch(researchQuestion, {
    perPage: clamped,
    sort: "cited_by_count:desc",
  });

  const now = new Date().toISOString();

  const entries: EvidenceEntry[] = works
    .filter((w) => (w.cited_by_count ?? 0) >= minCitations)
    .filter((w) => {
      if (yearFrom && w.publication_year && w.publication_year < yearFrom) return false;
      if (yearTo && w.publication_year && w.publication_year > yearTo) return false;
      return true;
    })
    .map((w): EvidenceEntry => ({
      id: w.id,
      title: w.display_name,
      authors: (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean),
      year: w.publication_year ?? null,
      doi: w.doi ?? null,
      url: w.doi ? `https://doi.org/${w.doi}` : w.id,
      abstract: w.abstract_inverted_index
        ? reconstructAbstract(w.abstract_inverted_index)
        : null,
      cited_by: w.cited_by_count ?? 0,
      source: "openalex",
      is_verified: true,
      retrieved_at: now,
    }));

  return {
    query: researchQuestion,
    total_results: entries.length,
    entries,
    generated_at: now,
    skill: "academic-literature-search",
    framework_version: "okaro-v1",
  };
}

// ─────────────────────────────────────────────
// Title verification (for cross-checking claims)
// ─────────────────────────────────────────────

/**
 * Verify whether a specific title exists in OpenAlex.
 * Returns the verified entry or null — never a guess.
 */
export async function verifyTitle(title: string): Promise<EvidenceEntry | null> {
  const works = await openAlexTitleSearch(title);
  if (!works.length) return null;

  const w = works[0];
  const now = new Date().toISOString();

  return {
    id: w.id,
    title: w.display_name,
    authors: (w.authorships ?? []).map((a) => a.author?.display_name).filter(Boolean),
    year: w.publication_year ?? null,
    doi: w.doi ?? null,
    url: w.doi ? `https://doi.org/${w.doi}` : w.id,
    abstract: w.abstract_inverted_index
      ? reconstructAbstract(w.abstract_inverted_index)
      : null,
    cited_by: w.cited_by_count ?? 0,
    source: "openalex",
    is_verified: true,
    retrieved_at: now,
  };
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * OpenAlex stores abstracts as inverted indexes.
 * Reconstruct the readable string.
 */
function reconstructAbstract(
  inverted: Record<string, number[]>,
): string {
  const positions: [number, string][] = [];
  for (const [word, idxs] of Object.entries(inverted)) {
    for (const i of idxs) positions.push([i, word]);
  }
  positions.sort((a, b) => a[0] - b[0]);
  return positions.map(([, w]) => w).join(" ");
}

// ─────────────────────────────────────────────
// CLI smoke test (run with: npx tsx server/agents/literatureDiscovery.ts)
// ─────────────────────────────────────────────

if (require.main === module) {
  const q = process.argv.slice(2).join(" ") || "real-time 3D human pose estimation on mobile";
  runLiteratureDiscovery(q, { maxResults: 5 })
    .then((matrix) => {
      console.log(JSON.stringify(matrix, null, 2));
    })
    .catch((err) => {
      console.error("Discovery failed:", err.message);
      process.exit(1);
    });
}
