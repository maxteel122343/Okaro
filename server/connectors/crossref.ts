/**
 * Okaro — Crossref adapter (same interface as OpenAlex connector)
 * No API key required. Rate limit: polite pool via User-Agent.
 */
export type CrossrefWork = {
  doi: string;
  title: string;
  abstract: string | null;
  authors: string[];
  year: number | null;
  url: string;
  is_verified: true;
  source: "crossref";
  container_title: string | null;
  type: string | null;
  citations: number;
};

const BASE = "https://api.crossref.org/works";

async function get(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Okaro/1.0 (mailto:research@okaro.local)" },
  });
  if (!res.ok) throw new Error(`Crossref ${res.status}: ${url}`);
  return res.json();
}

export async function crossrefSearch(query: string, rows = 10): Promise<CrossrefWork[]> {
  const data = await get(`${BASE}?query=${encodeURIComponent(query)}&rows=${rows}&select=DOI,title,abstract,author,published-print,published-online,URL,container-title,type,is-referenced-by-count`);
  return (data.message?.items ?? []).map(mapWork);
}

export async function crossrefByDoi(doi: string): Promise<CrossrefWork | null> {
  try {
    const data = await get(`${BASE}/${encodeURIComponent(doi)}?select=DOI,title,abstract,author,published-print,published-online,URL,container-title,type,is-referenced-by-count`);
    return data.message ? mapWork(data.message) : null;
  } catch {
    return null;
  }
}

export async function crossrefBatchSearch(queries: string[], rows = 5): Promise<CrossrefWork[][]> {
  const results = await Promise.all(queries.map((q) => crossrefSearch(q, rows).catch(() => [] as CrossrefWork[])));
  const seen = new Set<string>();
  return results.map((group) =>
    group.filter((w) => {
      if (seen.has(w.doi)) return false;
      seen.add(w.doi);
      return true;
    })
  );
}

function mapWork(item: any): CrossrefWork {
  const year = item["published-print"]?.["date-parts"]?.[0]?.[0]
    ?? item["published-online"]?.["date-parts"]?.[0]?.[0]
    ?? null;
  return {
    doi: item.DOI ?? "",
    title: (item.title ?? []).join(" "),
    abstract: item.abstract ? stripJats(item.abstract) : null,
    authors: (item.author ?? []).map((a: any) => `${a.given ?? ""} ${a.family ?? ""}`.trim()),
    year,
    url: item.URL ?? `https://doi.org/${item.DOI}`,
    is_verified: true,
    source: "crossref",
    container_title: (item["container-title"] ?? [])[0] ?? null,
    type: item.type ?? null,
    citations: item["is-referenced-by-count"] ?? 0,
  };
}

function stripJats(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
