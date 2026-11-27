/**
 * Okaro — PubMed adapter (same interface as OpenAlex/Crossref connectors)
 * Uses NCBI E-utilities. No key required (3 req/s public pool).
 */
export type PubMedWork = {
  doi: string | null;
  title: string;
  abstract: string | null;
  authors: string[];
  year: number | null;
  url: string;
  is_verified: true;
  source: "pubmed";
  journal: string | null;
  citations: number;
  mesh_terms: string[];
  pm_id: string;
};

const ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
const EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";

async function get(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PubMed ${res.status}: ${url}`);
  const text = await res.text();
  // NCBI returns JSON when retmode=json
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export async function pubmedSearch(query: string, retmax = 10): Promise<PubMedWork[]> {
  const search = await get(`${ESEARCH}?db=pubmed&term=${encodeURIComponent(query)}&retmax=${retmax}&retmode=json&sort=relevance`);
  const ids: string[] = search.esearchresult?.idlist ?? [];
  if (!ids.length) return [];
  await sleep(350); // respect 3 req/s
  const summary = await get(`${ESUMMARY}?db=pubmed&id=${ids.join(",")}&retmode=json`);
  const results = summary.result ?? {};
  return ids.map((id) => mapSummary(results[id])).filter(Boolean) as PubMedWork[];
}

export async function pubmedByDoi(doi: string): Promise<PubMedWork | null> {
  const found = await pubmedSearch(doi, 3);
  return found.find((w) => w.doi === doi) ?? found[0] ?? null;
}

export async function pubmedBatchSearch(queries: string[], retmax = 5): Promise<PubMedWork[][]> {
  const out: PubMedWork[][] = [];
  for (const q of queries) {
    out.push(await pubmedSearch(q, retmax).catch(() => []));
    await sleep(350);
  }
  const seen = new Set<string>();
  return out.map((group) =>
    group.filter((w) => {
      const k = w.pm_id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
  );
}

function mapSummary(item: any): PubMedWork | null {
  if (!item?.uid) return null;
  return {
    doi: item.elocationid?.replace("doi: ", "") ?? null,
    title: item.title ?? "",
    abstract: null, // esummary doesn't include abstract; efetch would
    authors: (item.authors ?? []).map((a: any) => a.name).filter(Boolean),
    year: item.pubdate ? parseInt(item.pubdate.slice(0, 4), 10) : null,
    url: `https://pubmed.ncbi.nlm.nih.gov/${item.uid}/`,
    is_verified: true,
    source: "pubmed",
    journal: item.fulljournalname ?? item.source ?? null,
    citations: 0,
    mesh_terms: [],
    pm_id: item.uid,
  };
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
