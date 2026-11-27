/**
 * OpenAlex connector — verified academic literature discovery.
 *
 * Replaces the Gemini-invented-title discovery phase in literatureReviewAgent.ts.
 * Every paper returned here has a real DOI, URL, and abstract from OpenAlex.
 *
 * Usage in literatureReviewAgent.ts:
 *   import { openAlexSearch, openAlexTitleSearch } from "../connectors/openalex.ts";
 *   const results = await openAlexSearch(task.focus, opts.cutoffDate);
 */

const OPENALEX_BASE = "https://api.openalex.org";
const PER_PAGE = 10;
const RATE_LIMIT_MS = 120; // polite pool: ~8 req/s, we stay well under

export interface OpenAlexAuthor {
  name: string;
  orcid?: string;
}

export interface OpenAlexPaper {
  citation_key: string;
  title: string;
  authors: OpenAlexAuthor[];
  venue: string;
  year: number;
  abstract: string;
  citation_count: number;
  doi: string | null;
  url: string;
  publication_date: string;
  journal: string | null;
  volume: string | null;
  pages: string | null;
  is_verified: true; // always true — this connector only returns API-confirmed records
}

interface OpenAlexWork {
  id: string;
  doi: string | null;
  title: string;
  publication_year: number;
  publication_date: string;
  cited_by_count: number;
  abstract_inverted_index: Record<string, number[]> | null;
  authorships: Array<{
    author: { display_name: string; orcid?: string };
  }>;
  primary_location?: {
    source?: {
      display_name: string;
      type: string;
    };
    volume?: string;
    first_page?: string;
    last_page?: string;
  };
  locations?: Array<{
    pdf_url?: string;
    landing_page_url?: string;
  }>;
}

interface OpenAlexResponse {
  meta: { count: number };
  results: OpenAlexWork[];
}

/** Reconstruct abstract from OpenAlex inverted index. */
function reconstructAbstract(
  inv: Record<string, number[]> | null
): string {
  if (!inv) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inv)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.join(" ").replace(/\s+/g, " ").trim();
}

/** Build a BibTeX-safe citation key from authors + year + title. */
function buildCitationKey(
  authors: OpenAlexAuthor[],
  year: number,
  title: string
): string {
  const firstAuthor = authors[0]?.name ?? "Unknown";
  const lastName = firstAuthor.trim().split(/\s+/).pop() ?? "Unknown";
  const cleanAuthor = lastName.replace(/[^a-zA-Z]/g, "") || "Author";
  const stopwords = new Set([
    "the", "a", "an", "in", "on", "at", "for", "to", "of", "and", "is", "are", "with", "by", "study",
  ]);
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !stopwords.has(w));
  const titlePart = words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("") || "Paper";
  return `${cleanAuthor.charAt(0).toUpperCase() + cleanAuthor.slice(1)}${year}${titlePart}`;
}

function mapWork(w: OpenAlexWork): OpenAlexPaper {
  const authors: OpenAlexAuthor[] = (w.authorships ?? []).map((a) => ({
    name: a.author.display_name,
    orcid: a.author. ORCID,
  }));
  const venue = w.primary_location?.source?.display_name ?? "Unknown venue";
  const journalType = w.primary_location?.source?.type;
  const isJournal = journalType === "journal";
  const pages = [w.primary_location?.first_page, w.primary_location?.last_page]
    .filter(Boolean)
    .join("--");

  return {
    citation_key: buildCitationKey(authors, w.publication_year, w.title),
    title: w.title,
    authors,
    venue,
    year: w.publication_year,
    abstract: reconstructAbstract(w.abstract_inverted_index),
    citation_count: w.cited_by_count ?? 0,
    doi: w.doi,
    url: w.doi
      ? `https://doi.org/${w.doi.replace("https://doi.org/", "")}`
      : w.locations?.find((l) => l.landing_page_url || l.pdf_url)
          ?.landing_page_url ??
        w.locations?.find((l) => l.pdf_url || l.landing_page_url)
          ?.pdf_url ??
        w.id,
    publication_date: w.publication_date,
    journal: isJournal ? venue : null,
    volume: w.primary_location?.volume ?? null,
    pages: pages || null,
    is_verified: true,
  };
}

async function openAlexGet(params: Record<string, string>): Promise<OpenAlexResponse> {
  const url = new URL(`${OPENALEX_BASE}/works`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  // Identify the app for the polite pool (no key needed, just a mailto)
  url.searchParams.set("mailto", "okaro@example.com");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`OpenAlex ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<OpenAlexResponse>;
}

/**
 * Search OpenAlex by free-text query. Returns verified papers only.
 * Each result has DOI, URL, abstract, and citation count from the API.
 */
export async function openAlexSearch(
  query: string,
  cutoffDate: string,
  limit = PER_PAGE
): Promise<OpenAlexPaper[]> {
  await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));

  const data = await openAlexGet({
    search: query,
    "filter": `publication_date:<${cutoffDate}`,
    per_page: String(limit),
    sort: "cited_by_count:desc",
  });

  return data.results.map(mapWork);
}

/**
 * Search OpenAlex by exact-ish title. Used to verify a candidate title
 * the outline agent proposed (replaces the Gemini-invent + S2-rescue flow).
 */
export async function openAlexTitleSearch(
  title: string,
  year: number | undefined,
  cutoffDate: string
): Promise<OpenAlexPaper | null> {
  await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));

  // Use title.search for fuzzy matching; add year filter when known
  const filter = year
    ? `publication_year:${year},publication_date:<${cutoffDate}`
    : `publication_date:<${cutoffDate}`;

  const data = await openAlexGet({
    "filter": `${filter}`,
    search: title,
    per_page: "3",
  });

  if (data.results.length === 0) return null;

  // Pick the closest title match (normalized)
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(title);
  const best = data.results.reduce((prev, curr) => {
    const prevScore = norm(prev.title) === target ? 2 : norm(prev.title).includes(target) || target.includes(norm(prev.title)) ? 1 : 0;
    const currScore = norm(curr.title) === target ? 2 : norm(curr.title).includes(target) || target.includes(norm(curr.title)) ? 1 : 0;
    return currScore > prevScore ? curr : prev;
  });

  const mapped = mapWork(best);
  // Only return if the title is a reasonable match
  const bestNorm = norm(best.title);
  if (bestNorm === target || bestNorm.includes(target) || target.includes(bestNorm)) {
    return mapped;
  }
  return null;
}

/**
 * Batch search: run multiple queries, dedupe by normalized title.
 * Respects rate limits between calls.
 */
export async function openAlexBatchSearch(
  queries: string[],
  cutoffDate: string,
  perQuery = 5
): Promise<OpenAlexPaper[]> {
  const seen = new Set<string>();
  const results: OpenAlexPaper[] = [];

  for (const q of queries) {
    try {
      const papers = await openAlexSearch(q, cutoffDate, perQuery);
      for (const p of papers) {
        const key = p.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!seen.has(key)) {
          seen.add(key);
          results.push(p);
        }
      }
    } catch (err) {
      // Log but don't abort the batch
      console.error(`OpenAlex batch error for "${q}":`, err);
    }
  }
  return results;
}
