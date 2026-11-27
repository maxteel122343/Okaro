export interface S2PaperResult {
  title: string;
  authors: Array<{ name: string }>;
  venue?: string;
  year?: number;
  abstract?: string;
  citationCount?: number;
  journal?: { name?: string; volume?: string; pages?: string };
  publicationDate?: string;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[n];
}

function fuzzRatio(a: string, b: string): number {
  if (!a && !b) return 100;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  const dist = levenshtein(a, b);
  return Math.round(((maxLen - dist) / maxLen) * 100);
}

export function isPaperDateValid(
  publicationDate?: string,
  year?: number,
  cutoffDate?: string
): boolean {
  if (!cutoffDate) return true;
  try {
    const parts = cutoffDate.split("-").map((x) => parseInt(x, 10));
    const cYear = parts[0];
    const cMonth = parts[1] ?? 12;

    if (publicationDate) {
      const pMatch = publicationDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (pMatch) {
        const pYear = parseInt(pMatch[1], 10);
        const pMonth = parseInt(pMatch[2], 10);
        if (pYear < cYear) return true;
        if (pYear > cYear) return false;
        return pMonth < cMonth;
      }
    }
    if (year) {
      if (year < cYear) return true;
      if (year === cYear && cMonth > 1) return true;
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export async function s2TitleSearch(
  titleQuery: string,
  yearHint?: number,
  cutoffDate?: string
): Promise<S2PaperResult | null> {
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["X-API-KEY"] = apiKey;
  }

  try {
    const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
    url.searchParams.set("query", titleQuery);
    url.searchParams.set("limit", "3");
    url.searchParams.set(
      "fields",
      "title,authors,venue,year,abstract,citationCount,journal,publicationDate"
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const rsp = await fetch(url.toString(), {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!rsp.ok) {
      return null;
    }

    const data = (await rsp.json()) as { data?: S2PaperResult[] };
    const results = data.data ?? [];
    if (results.length === 0) return null;

    let bestMatch: S2PaperResult | null = null;
    let highestRatio = 0;

    for (const r of results) {
      if (!r.title) continue;
      if (!isPaperDateValid(r.publicationDate, r.year, cutoffDate)) continue;

      let ratio = fuzzRatio(titleQuery.toLowerCase(), r.title.toLowerCase());
      if (yearHint && r.year === yearHint) {
        ratio += 10;
      }

      if (ratio > highestRatio) {
        highestRatio = ratio;
        bestMatch = r;
      }
    }

    return highestRatio > 70 ? bestMatch : null;
  } catch {
    return null;
  }
}
