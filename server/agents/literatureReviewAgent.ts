import fs from "node:fs";
import path from "node:path";
import {
  callGeminiWithRetry,
  parseGeminiJsonResults,
  parseGeminiLatexResults,
} from "../gemini.ts";
import { buildLiteratureWriterPrompt } from "../prompts.ts";
import { s2TitleSearch } from "../scholar.ts";

interface SearchTask {
  section: string;
  focus: string;
  context: string;
  search_type: "exploration" | "targeted";
}

interface CandidatePaper {
  title: string;
  year?: number;
  reason?: string;
}

export interface PaperData {
  citation_key: string;
  title: string;
  authors: string[];
  venue: string;
  year: number;
  abstract: string;
  citation_count: number;
  found_in_section: string;
  reason: string;
  journal?: string;
  volume?: string;
  pages?: string;
  publication_date?: string;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function generateKey(
  authorsRaw: Array<{ name: string } | string>,
  year: number | undefined,
  title: string
): string {
  let firstAuthor = "Unknown";
  if (authorsRaw && authorsRaw.length > 0) {
    const first = authorsRaw[0];
    const nameStr = typeof first === "string" ? first : first.name || "Unknown";
    const parts = nameStr.trim().split(/\s+/);
    firstAuthor = parts[parts.length - 1] || "Unknown";
  }

  const cleanAuthor =
    firstAuthor.replace(/[^a-zA-Z]/g, "").replace(/^./, (c) => c.toUpperCase()) ||
    "Author";
  const yearStr = String(year || 2024);

  const stopwords = new Set([
    "the",
    "a",
    "an",
    "in",
    "on",
    "at",
    "for",
    "to",
    "of",
    "and",
    "is",
    "are",
    "with",
    "by",
    "study",
  ]);
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !stopwords.has(w));
  const titlePart =
    words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("") || "Paper";

  return `${cleanAuthor}${yearStr}${titlePart}`;
}

function collectSearchTasks(outline: any): SearchTask[] {
  const tasks: SearchTask[] = [];
  const plan = outline?.intro_related_work_plan ?? {};

  const introStrat = plan.introduction_strategy ?? {};
  for (const direction of introStrat.search_directions ?? []) {
    tasks.push({
      section: "Introduction",
      focus: String(direction),
      context: `Hook: ${introStrat.hook_hypothesis ?? ""}. Gap: ${introStrat.problem_gap_hypothesis ?? ""}`,
      search_type: "exploration",
    });
  }

  const rwStrat = plan.related_work_strategy ?? {};
  for (const sub of rwStrat.subsections ?? []) {
    const queries: string[] =
      sub.limitation_search_queries && sub.limitation_search_queries.length > 0
        ? sub.limitation_search_queries
        : [`${sub.subsection_title ?? ""} ${sub.methodology_cluster ?? ""}`];

    for (const q of queries) {
      tasks.push({
        section: `Related Work: ${sub.subsection_title ?? "General"}`,
        focus: String(q),
        context: `Mission: ${sub.sota_investigation_mission ?? ""}. Hypothesis: ${sub.limitation_hypothesis ?? ""}`,
        search_type: "exploration",
      });
    }
  }

  for (const section of outline?.section_plan ?? []) {
    const sectionTitle = section.section_title ?? "Unknown Section";
    for (const subsection of section.subsections ?? []) {
      const subTitle = subsection.subsection_title ?? "General";
      const contextStr = (subsection.content_bullets ?? []).join(" ");
      for (const hint of subsection.citation_hints ?? []) {
        tasks.push({
          section: `${sectionTitle} - ${subTitle}`,
          focus: String(hint),
          context: `Must-have citation for section covering: ${contextStr}`,
          search_type: "targeted",
        });
      }
    }
  }

  return tasks;
}

async function discoverCandidates(
  task: SearchTask,
  outline: any,
  cutoffDate: string,
  searchModelName: string
): Promise<CandidatePaper[]> {
  const coreProblem =
    outline?.intro_related_work_plan?.introduction_strategy
      ?.problem_gap_hypothesis ?? "N/A";

  const prompt =
    task.search_type === "targeted"
      ? `Identify the SPECIFIC academic paper described by this hint: "${task.focus}".

CONTEXT: ${task.context}
CUTOFF DATE: Published BEFORE ${cutoffDate}

INSTRUCTIONS:
1. Use Google Search to find the EXACT title and year of this paper.
2. If the hint refers to a dataset, model architecture, or baseline, find the primary, original paper that introduced it.
3. Return EXACTLY 1 candidate paper that matches best.

YOU MUST return the results in json format (\`\`\`json ... \`\`\`) with keys:
{ "section_name": "${task.section}", "candidates": [{ "title": "...", "year": 2023, "reason": "..." }] }`
      : `Find 8-12 highly relevant, influential academic papers matching the search task. Only return strictly relevant real papers.

SEARCH TASK: ${task.focus}
CONTEXT FOR TASK: ${task.context}
BROADER PROJECT PROBLEM: ${coreProblem}
CUTOFF DATE: Published BEFORE ${cutoffDate}

INSTRUCTIONS:
1. Use Google Search to find REAL papers (ArXiv, CVPR, NeurIPS, ICML, ICLR, etc.).
2. Only return papers published in top-tier conferences/journals or highly-cited works relevant to the task.

YOU MUST return the results in json format (\`\`\`json ... \`\`\`) with keys:
{ "section_name": "${task.section}", "candidates": [{ "title": "...", "year": 2023, "reason": "..." }] }`;

  for (let retry = 0; retry < 2; retry++) {
    try {
      const res = await callGeminiWithRetry({
        modelName: searchModelName,
        contents: [{ text: prompt }],
        tools: [{ googleSearch: {} }],
        temperature: task.search_type === "targeted" ? 0.1 : 0.4,
        parser: parseGeminiJsonResults,
        requireParsed: true,
        maxRetries: 2,
      });
      const cands = res.parsedResponse?.candidates;
      if (Array.isArray(cands) && cands.length > 0) {
        return cands;
      }
    } catch {
      // Retry
    }
  }
  return [];
}

function generateBibtex(papers: PaperData[]): string {
  const seenKeys = new Set<string>();
  const entries: string[] = [];

  for (const p of papers) {
    const baseKey = p.citation_key;
    let uniqueKey = baseKey;
    let suffixCode = 97; // 'a'
    while (seenKeys.has(uniqueKey)) {
      uniqueKey = `${baseKey}${String.fromCharCode(suffixCode)}`;
      suffixCode++;
    }
    p.citation_key = uniqueKey;
    seenKeys.add(uniqueKey);

    const authorStr = p.authors.length > 0 ? p.authors.join(" and ") : "Unknown";
    const entryType = p.journal ? "article" : "inproceedings";
    let entry = `@${entryType}{${p.citation_key},\n  title={${p.title}},\n  author={${authorStr}},\n`;
    if (p.journal) {
      entry += `  journal={${p.journal}},\n`;
    } else {
      entry += `  booktitle={${p.venue}},\n`;
    }
    entry += `  year={${p.year}}`;
    if (p.volume) entry += `,\n  volume={${p.volume}}`;
    if (p.pages) entry += `,\n  pages={${p.pages}}`;
    entry += "\n}";
    entries.push(entry);
  }

  return entries.join("\n\n");
}

function generateCitationMap(papers: PaperData[]): Record<string, any> {
  const map: Record<string, any> = {};
  for (const p of papers) {
    if (!p.abstract) continue;
    map[p.citation_key] = {
      citation_key: p.citation_key,
      title: p.title,
      authors: p.authors,
      venue: p.venue,
      year: p.year,
      abstract: p.abstract.trim(),
    };
  }
  return map;
}

function injectCitationsIntoOutline(
  outline: any,
  registry: Map<string, PaperData>
): any {
  const sectionToKeys = new Map<string, string[]>();
  for (const p of registry.values()) {
    const arr = sectionToKeys.get(p.found_in_section) ?? [];
    arr.push(p.citation_key);
    sectionToKeys.set(p.found_in_section, arr);
  }

  const plan = outline?.intro_related_work_plan ?? {};
  if (plan.introduction_strategy) {
    plan.introduction_strategy.citation_candidates = [
      ...new Set(sectionToKeys.get("Introduction") ?? []),
    ];
  }

  if (plan.related_work_strategy?.subsections) {
    for (const sub of plan.related_work_strategy.subsections) {
      const key = `Related Work: ${sub.subsection_title ?? "General"}`;
      sub.citation_candidates = sectionToKeys.get(key) ?? [];
    }
  }

  for (const section of outline?.section_plan ?? []) {
    const sectionTitle = section.section_title ?? "Unknown Section";
    for (const sub of section.subsections ?? []) {
      const subTitle = sub.subsection_title ?? "General";
      const key = `${sectionTitle} - ${subTitle}`;
      sub.citation_candidates = sectionToKeys.get(key) ?? [];
      delete sub.citation_hints;
    }
  }

  return outline;
}

export interface LiteratureAgentOptions {
  ideaPath: string;
  experimentalLogPath: string;
  latexTemplatePath: string;
  conferenceGuidelinesPath: string;
  outputDir: string;
  outlinePath: string;
  modelName: string;
  cutoffDate: string;
  onLog?: (msg: string) => void;
}

export async function runLiteratureReviewAgent(
  opts: LiteratureAgentOptions
): Promise<void> {
  const log = opts.onLog ?? (() => {});
  fs.mkdirSync(opts.outputDir, { recursive: true });

  log(
    `🚀 Starting Fast Hybrid Literature Agent (Cutoff: ${opts.cutoffDate})...\n`
  );

  const outline = JSON.parse(fs.readFileSync(opts.outlinePath, "utf-8"));
  const ideaContent = fs.readFileSync(opts.ideaPath, "utf-8");
  const expLogContent = fs.readFileSync(opts.experimentalLogPath, "utf-8");
  const templateContent = fs.readFileSync(opts.latexTemplatePath, "utf-8");

  const searchTasks = collectSearchTasks(outline);
  log(`📚 Phase 1: Analyzing Plan & Executing Search Tasks...\n`);
  log(`    -> Identified ${searchTasks.length} distinct search tasks.\n`);
  log(`   🔎 Phase 1a: Google Candidates Discovery...\n`);

  const searchModel = opts.modelName.includes("flash")
    ? opts.modelName
    : "gemini-3-flash-preview";

  const allCandidates: Array<{ cand: CandidatePaper; task: SearchTask }> = [];
  const batchSize = 5;
  for (let i = 0; i < searchTasks.length; i += batchSize) {
    const batch = searchTasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (task) => {
        const prefix =
          task.search_type === "targeted"
            ? `   🎯 Targeted Search [${task.section}]`
            : `   🔎 Exploration [${task.section}]`;
        log(`${prefix}: '${task.focus}'\n`);
        const cands = await discoverCandidates(
          task,
          outline,
          opts.cutoffDate,
          searchModel
        );
        return { cands, task };
      })
    );
    for (const { cands, task } of batchResults) {
      for (const cand of cands) {
        if (cand?.title) {
          allCandidates.push({ cand, task });
        }
      }
    }
  }

  log(`   📊 Phase 1b: Semantic Scholar Enrichment...\n`);
  const registry = new Map<string, PaperData>();

  for (const { cand, task } of allCandidates) {
    const normTitle = normalizeTitle(cand.title);
    if (!normTitle || registry.has(normTitle)) continue;

    // Gentle pacing for Semantic Scholar rate limits
    await new Promise((r) => setTimeout(r, 350));
    const s2Data = await s2TitleSearch(cand.title, cand.year, opts.cutoffDate);

    if (s2Data && s2Data.abstract) {
      const authorsList = (s2Data.authors ?? []).map((a) => a.name);
      let abstractText = s2Data.abstract;
      if (abstractText.length > 1500) {
        abstractText = abstractText.slice(0, 1500) + "... [Truncated]";
      }
      const fullObj: PaperData = {
        citation_key: generateKey(
          s2Data.authors ?? [],
          s2Data.year ?? cand.year,
          s2Data.title
        ),
        title: s2Data.title,
        authors: authorsList,
        venue: s2Data.venue || "arXiv",
        year: s2Data.year || cand.year || 2024,
        abstract: abstractText,
        citation_count: s2Data.citationCount || 0,
        found_in_section: task.section,
        reason: cand.reason || "",
        journal: s2Data.journal?.name,
        volume: s2Data.journal?.volume,
        pages: s2Data.journal?.pages,
        publication_date: s2Data.publicationDate,
      };
      const finalNorm = normalizeTitle(fullObj.title);
      if (!registry.has(finalNorm)) {
        registry.set(finalNorm, fullObj);
        log(`      -> 📚 Added enriched paper: ${fullObj.title}\n`);
      }
    } else if (cand.title && cand.reason && registry.size < 45) {
      // Fallback if S2 rate-limits or lacks abstract so grounded Google Search papers are retained
      const fallbackObj: PaperData = {
        citation_key: generateKey([], cand.year, cand.title),
        title: cand.title,
        authors: ["Research Authors"],
        venue: "arXiv / Conference Proceedings",
        year: cand.year || 2024,
        abstract: cand.reason,
        citation_count: 0,
        found_in_section: task.section,
        reason: cand.reason,
      };
      registry.set(normTitle, fallbackObj);
      log(`      -> 📄 Added grounded paper: ${fallbackObj.title}\n`);
    }
  }

  const finalPapers = Array.from(registry.values());
  log(
    `\n✨ Final Count: ${finalPapers.length} unique enriched papers retrieved.\n`
  );

  const bibtexStr = generateBibtex(finalPapers);
  const citationMap = generateCitationMap(finalPapers);

  log(`🔄 Injecting citations back into Outline...\n`);
  const updatedOutline = injectCitationsIntoOutline(outline, registry);

  log(`✍️  Phase 3: Writing Introduction & Related Work...\n`);
  const contextPayload = {
    "template.tex": templateContent,
    intro_related_work_plan: updatedOutline.intro_related_work_plan ?? {},
    project_idea: ideaContent,
    project_experimental_log: expLogContent,
    citation_checklist: finalPapers.map((p) => p.citation_key),
    collected_papers: finalPapers,
  };

  const writerSystemPrompt = buildLiteratureWriterPrompt(
    finalPapers.length,
    Math.floor(finalPapers.length * 0.9),
    opts.cutoffDate
  );

  const synthesis = await callGeminiWithRetry({
    modelName: opts.modelName,
    systemInstruction: writerSystemPrompt,
    contents: [
      { text: "Generate the LaTeX for Introduction and Related Work sections." },
      { text: JSON.stringify(contextPayload) },
    ],
    parser: parseGeminiLatexResults,
    requireParsed: true,
  });

  fs.writeFileSync(
    path.join(opts.outputDir, "updated_template.tex"),
    synthesis.parsedResponse,
    "utf-8"
  );
  fs.writeFileSync(
    path.join(opts.outputDir, "references.bib"),
    bibtexStr,
    "utf-8"
  );
  fs.writeFileSync(
    path.join(opts.outputDir, "citation_map.json"),
    JSON.stringify(citationMap, null, 4),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(opts.outputDir, "outline_v1.json"),
    JSON.stringify(updatedOutline, null, 4),
    "utf-8"
  );

  log(`✅ Done! Literature Review Outputs saved to ${opts.outputDir}/\n`);
}
