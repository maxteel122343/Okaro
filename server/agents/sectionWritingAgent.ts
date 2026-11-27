import fs from "node:fs";
import path from "node:path";
import { callGeminiWithRetry, parseGeminiLatexResults } from "../gemini.ts";
import { SECTION_WRITING_AGENT_PROMPT } from "../prompts.ts";

function formatFiguresContext(figuresInfo: Array<{ name?: string; caption?: string }>): string {
  if (!figuresInfo || figuresInfo.length === 0) {
    return "No figures provided.";
  }
  let context = "### AVAILABLE FIGURES LIST\n";
  figuresInfo.forEach((fig, idx) => {
    let name = fig.name || `figure_${idx + 1}.png`;
    if (
      !name.endsWith(".png") &&
      !name.endsWith(".jpg") &&
      !name.endsWith(".jpeg") &&
      !name.endsWith(".pdf")
    ) {
      name += ".png";
    }
    const caption = fig.caption || "No caption provided.";
    context += `Item ${idx + 1}:\n  - Filename: ${name}\n  - Caption: ${caption}\n--------------------------------------------------\n`;
  });
  return context;
}

function formatCitationLibrary(citationMap: Record<string, any>): string {
  const keys = Object.keys(citationMap);
  if (keys.length === 0) return "No citation data provided.";

  let context = "### REFERENCE LIBRARY (Use these keys for \\cite{})\n";
  for (const key of keys) {
    const data = citationMap[key] ?? {};
    const title = data.title || "Unknown Title";
    const authorsList: string[] = Array.isArray(data.authors) ? data.authors : [];
    let authors = authorsList.slice(0, 3).join(", ");
    if (authorsList.length > 3) authors += " et al.";
    const year = data.year ?? "N/A";
    const abstract = data.abstract || "No abstract available.";
    context += `--- Key: ${key} ---\nTitle: ${title}\nAuthors: ${authors} (${year})\nAbstract: ${abstract}\n\n`;
  }
  return context;
}

export interface SectionWritingOptions {
  outlinePath: string;
  templatePath: string;
  ideaPath: string;
  experimentalLogPath: string;
  citationMapPath: string;
  figuresInfoPath: string;
  guidelinesPath: string;
  modelName: string;
  outputPath: string;
  onLog?: (msg: string) => void;
}

export async function runSectionWritingAgent(
  opts: SectionWritingOptions
): Promise<string> {
  const log = opts.onLog ?? (() => {});
  log(` > Agent SectionWritingAgent starting...\n`);

  const readFileSafe = (p: string) =>
    fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : `[File ${p} not found]`;
  const readJsonSafe = (p: string) => {
    try {
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : {};
    } catch {
      return {};
    }
  };

  const outlineContent = readFileSafe(opts.outlinePath);
  const templateContent = readFileSafe(opts.templatePath);
  const ideaContent = readFileSafe(opts.ideaPath);
  const logContent = readFileSafe(opts.experimentalLogPath);
  const guidelinesContent = readFileSafe(opts.guidelinesPath);

  const citationMap = readJsonSafe(opts.citationMapPath);
  const citationLibraryContent = formatCitationLibrary(citationMap);

  const figuresInfoRaw = readJsonSafe(opts.figuresInfoPath);
  const figuresInfo: Array<{ name?: string; caption?: string }> = Array.isArray(
    figuresInfoRaw
  )
    ? figuresInfoRaw
    : [];
  const figuresContent = formatFiguresContext(figuresInfo);

  const figuresDir = path.dirname(opts.figuresInfoPath);
  const imageParts: Array<{ inlineData: { data: string; mimeType: string } }> =
    [];

  for (const fig of figuresInfo) {
    let name = fig.name || "";
    if (!name) continue;
    if (
      !name.endsWith(".png") &&
      !name.endsWith(".jpg") &&
      !name.endsWith(".jpeg") &&
      !name.endsWith(".pdf")
    ) {
      name += ".png";
    }
    if (name.endsWith(".pdf")) continue;
    const imgPath = path.join(figuresDir, name);
    if (fs.existsSync(imgPath)) {
      const data = fs.readFileSync(imgPath).toString("base64");
      const mimeType = name.toLowerCase().endsWith(".png")
        ? "image/png"
        : "image/jpeg";
      imageParts.push({ inlineData: { data, mimeType } });
    }
  }

  const userPrompt = `Here are the input materials for the paper.

--- INPUT: outline.json (Structure & Citation Candidates) ---
${outlineContent}

--- INPUT: citation_map.json (Reference Library) ---
${citationLibraryContent}

--- INPUT: idea.md (Technical Method Details) ---
${ideaContent}

--- INPUT: experimental_log.md (Raw Data for Tables) ---
${logContent}

--- INPUT: figures_list (Available Figure Files) ---
${figuresContent}

--- INPUT: conference_guidelines.md ---
${guidelinesContent}

--- INPUT: template.tex (DO NOT CHANGE EXISTING TEXT. FILL MISSING SECTIONS.) ---
${templateContent}

**INSTRUCTION**: 
1. Identify missing sections in \`template.tex\`.
2. Generate LaTeX content for those sections based on \`outline.json\`.
3. Construct tables using data from \`experimental_log.md\`.
4. Insert figures using the filenames from the 'figures_list' input.
5. Use citations from the Reference Library.
6. Return the **full** compilable LaTeX file.`;

  log(` > Generating paper content with Multimodal Images (${imageParts.length} figures)...\n`);

  const response = await callGeminiWithRetry({
    modelName: opts.modelName,
    systemInstruction: SECTION_WRITING_AGENT_PROMPT,
    temperature: 0.7,
    contents: [{ text: userPrompt }, ...imageParts],
    parser: parseGeminiLatexResults,
    requireParsed: true,
  });

  const cleanedLatex = response.parsedResponse;
  fs.writeFileSync(opts.outputPath, cleanedLatex, "utf-8");
  log(` > Paper saved to ${opts.outputPath}\n`);
  return cleanedLatex;
}
