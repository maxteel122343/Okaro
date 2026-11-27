/**
 * Okaro — OpenAlex Connector
 *
 * Direct, key-free access to the OpenAlex API (https://api.openalex.org).
 * Every function returns raw API data mapped to typed interfaces.
 * No LLM involvement. No invented metadata. If OpenAlex didn't return it,
 * it does not exist in the output.
 *
 * Rate limits: polite pool via a descriptive User-Agent; for production
 * throughput, set OPENALEX_API_KEY in the environment.
 */

const BASE = "https://api.openalex.org";

const HEADERS: Record<string, string> = {
  "User-Agent": "OkaroFramework/0.1 (mailto:okaro@example.com)",
  Accept: "application/json",
};

if (process.env.OPENALEX_API_KEY) {
  HEADERS.Authorization = `Bearer ${process.env.OPENALEX_API_KEY}`;
}

// ─────────────────────────────────────────────
// Types (minimal surface the agent needs)
// ─────────────────────────────────────────────

export interface OpenAlexAuthor {
  id: string;
  display_name: string;
  orcid?: string | null;
}

export interface OpenAlexAuthorship {
  author: OpenAlexAuthor;
  institutions?: { display_name: string }[];
}

export interface OpenAlexWork {
  id: string;
  doi: string | null;
  title: string;
  display_name: string;
  publication_year: number | null;
  cited_by_count: number;
  authorships: OpenAlexAuthorship[];
  abstract_inverted_index: Record<string, number[]> | null;
  type: string | null;
  open_access?: { is_oa: boolean; oa_url: string | null };
}

export interface OpenAlexSearchResponse {
  meta: { count: number; next_cursor: string | null };
  results: OpenAlexWork[];
}

// ─────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────

export interface SearchOptions {
  perPage?: number;
  page?: number;
  sort?: string; // e.g. "cited_by_count:desc"
  filter?: string; // OpenAlex filter syntax
}

/**
 * Full-text search across works. Sorted by citations by default.
 */
export async function openAlexSearch(
  query: string,
  options: SearchOptions = {},
): Promise<OpenAlexWork[]> {
  const {
    perPage = 10,
    page = 1,
    sort = "cited_by_count:desc",
    filter,
  } = options;

  const params = new URLSearchParams({
    search: query,
    per_page: String(perPage),
    page: String(page),
    sort,
  });
  if (filter) params.set("filter", filter);

  const res = await fetch(`${BASE}/works?${params}`, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`OpenAlex search failed: ${res.status} ${res.statusText}`);
  }
  const data: OpenAlexSearchResponse = await res.json();
  return data.results;
}

/**
 * Exact-ish title lookup. Useful for verifying a specific claim.
 */
export async function openAlexTitleSearch(
  title: string,
): Promise<OpenAlexWork[]> {
  // OpenAlex title filter uses ILIKE; wrap in quotes for safety
  const filter = `display_name.search:"${title.replace(/"/g, "")}"`;
  const params = new URLSearchParams({ filter, per_page: "5" });

  const res = await fetch(`${BASE}/works?${params}`, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`OpenAlex title search failed: ${res.status} ${res.statusText}`);
  }
  const data: OpenAlexSearchResponse = await res.json();
  return data.results;
}

/**
 * Batch: run several queries, dedupe by work id, return unified list.
 */
export async function openAlexBatchSearch(
  queries: string[],
  options: SearchOptions = {},
): Promise<OpenAlexWork[]> {
  const seen = new Set<string>();
  const all: OpenAlexWork[] = [];

  const results = await Promise.all(
    queries.map((q) => openAlexSearch(q, options).catch(() => [] as OpenAlexWork[])),
  );

  for (const batch of results) {
    for (const work of batch) {
      if (!seen.has(work.id)) {
        seen.add(work.id);
        all.push(work);
      }
    }
  }

  // Re-sort by citations across the merged set
  all.sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0));
  return all;
}
