import fs from "node:fs";
import path from "node:path";
import {
  callGeminiWithRetry,
  parseGeminiJsonLatexResponse,
  parseGeminiJsonResults,
  parseGeminiLatexResults,
} from "../gemini.ts";
import {
  AGENTREVIEW_INSTRUCTIONS,
  AGENTREVIEW_SYSTEM_PROMPT,
  CONTENT_REFINEMENT_AGENT_SYSTEM_PROMPT,
  META_REVIEWER_SYSTEM_PROMPT,
} from "../prompts.ts";
import { buildPdfFromLatex, extractPlainPaperText } from "../pdfBuilder.ts";

const SCORE_AXES = [
  "Originality",
  "Quality",
  "Clarity",
  "Significance",
  "Soundness",
  "Presentation",
  "Contribution",
  "Overall",
  "Confidence",
] as const;

function extractScores(review: Record<string, any>): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const axis of SCORE_AXES) {
    const n = Number(review?.[axis] ?? 0);
    scores[axis] = Number.isFinite(n) ? n : 0;
  }
  return scores;
}

async function performReviewAgentReview({
  paperText,
  modelName,
  numEnsemble = 2,
  onLog,
}: {
  paperText: string;
  modelName: string;
  numEnsemble?: number;
  onLog: (msg: string) => void;
}): Promise<Record<string, any>> {
  onLog(`Start paper reviewing using model: \`${modelName}\`\n`);
  const basePrompt = `${AGENTREVIEW_INSTRUCTIONS}
Here is the paper you are asked to review:
\`\`\`
${paperText.slice(0, 40000)}
\`\`\``;

  const reviews: Array<Record<string, any>> = [];
  for (let i = 0; i < numEnsemble; i++) {
    onLog(`Generating ensemble review ${i + 1}/${numEnsemble}...\n`);
    const res = await callGeminiWithRetry({
      modelName,
      systemInstruction: AGENTREVIEW_SYSTEM_PROMPT,
      temperature: 0.75,
      contents: [{ text: basePrompt }],
      parser: parseGeminiJsonResults,
      requireParsed: true,
    });
    reviews.push(res.parsedResponse);
  }

  if (reviews.length === 1) return reviews[0];

  let reviewText = "";
  reviews.forEach((r, idx) => {
    reviewText += `\nReview ${idx + 1}/${reviews.length}:\n\`\`\`\n${JSON.stringify(
      r
    )}\n\`\`\`\n`;
  });

  let metaReview: Record<string, any> = reviews[0];
  try {
    const metaRes = await callGeminiWithRetry({
      modelName,
      systemInstruction: META_REVIEWER_SYSTEM_PROMPT,
      temperature: 0.7,
      contents: [{ text: AGENTREVIEW_INSTRUCTIONS + reviewText }],
      parser: parseGeminiJsonResults,
      requireParsed: true,
    });
    if (metaRes.parsedResponse) {
      metaReview = metaRes.parsedResponse;
    }
  } catch {
    metaReview = reviews[0];
  }

  const limits: Array<[string, number, number]> = [
    ["Originality", 1, 4],
    ["Quality", 1, 4],
    ["Clarity", 1, 4],
    ["Significance", 1, 4],
    ["Soundness", 1, 4],
    ["Presentation", 1, 4],
    ["Contribution", 1, 4],
    ["Overall", 1, 10],
    ["Confidence", 1, 5],
  ];

  for (const [axis, min, max] of limits) {
    const vals = reviews
      .map((r) => Number(r[axis]))
      .filter((n) => Number.isFinite(n) && n >= min && n <= max);
    if (vals.length > 0) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      metaReview[axis] = Math.round(mean);
    }
  }

  return metaReview;
}

export interface ContentRefinementOptions {
  experimentalLogPath: string;
  citationMapPath: string;
  guidelinesPath: string;
  modelName: string;
  maxReflections?: number;
  workDir: string;
  texfilePath: string;
  onLog?: (msg: string) => void;
}

export async function runContentRefinementAgent(
  opts: ContentRefinementOptions
): Promise<string> {
  const log = opts.onLog ?? (() => {});
  const maxReflections = opts.maxReflections ?? 2;

  fs.mkdirSync(opts.workDir, { recursive: true });
  fs.mkdirSync(
    path.join(opts.workDir, "pdf_screenshots", "content_refinement"),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(opts.workDir, "pdf_screenshots", "format_refinement"),
    { recursive: true }
  );
  fs.mkdirSync(path.join(opts.workDir, "peer_reviews"), { recursive: true });

  const readSafe = (p: string) =>
    fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";

  let currentTex = readSafe(opts.texfilePath);
  const guidelines = readSafe(opts.guidelinesPath);
  const experimentalLog = readSafe(opts.experimentalLogPath);
  const citations = readSafe(opts.citationMapPath);

  const worklogSavePath = path.join(
    opts.workDir,
    "content_refinement_worklog.json"
  );
  const worklogs: Record<string, any> = {};
  const formatWorklogs: Record<string, any> = {};

  // --- STEP 0: Initial Baseline Review ---
  log(`\n=== Initial Baseline Review ===\n`);
  const initialTexPath = path.join(opts.workDir, "initial_draft.tex");
  const initialPdfPath = path.join(opts.workDir, "initial_draft.pdf");
  const v0ScreenshotsDir = path.join(
    opts.workDir,
    "pdf_screenshots",
    "content_refinement",
    "v0"
  );

  fs.writeFileSync(initialTexPath, currentTex, "utf-8");
  await buildPdfFromLatex(
    currentTex,
    opts.workDir,
    initialPdfPath,
    v0ScreenshotsDir
  );
  log(` >> Initial PDF saved to ${initialPdfPath}\n`);

  log(` >> [AgentReview] Generating feedback for initial paper...\n`);
  let currentPeerReview = await performReviewAgentReview({
    paperText: extractPlainPaperText(currentTex),
    modelName: opts.modelName,
    numEnsemble: 2,
    onLog: log,
  });
  let currentScore = Number(currentPeerReview.Overall ?? 0);
  log(` >> [Reviewer] Score for initial: ${currentScore}/10\n`);
  fs.writeFileSync(
    path.join(opts.workDir, "peer_reviews", "review_v0.json"),
    JSON.stringify(currentPeerReview, null, 4),
    "utf-8"
  );

  let finalValidPdfPath = initialPdfPath;

  // --- Content Refinement Loop ---
  for (let i = 0; i < maxReflections; i++) {
    log(`\n=== Refinement Iteration ${i + 1}/${maxReflections} ===\n`);
    const curFilename = `refined_paper_v${i + 1}`;
    const curPdfPath = path.join(opts.workDir, `${curFilename}.pdf`);
    const curTexPath = path.join(opts.workDir, `${curFilename}.tex`);

    const previousLogStr =
      Object.keys(worklogs).length > 0
        ? JSON.stringify(worklogs, null, 4)
        : "None";

    const userPromptText = `REFLECTION ITERATION ${i + 1}.

--- PREVIOUS ITERATION LOG ---
${previousLogStr}

--- CURRENT REVIEWER FEEDBACK (Score: ${currentScore}) ---
${JSON.stringify(currentPeerReview, null, 2)}

--- CONFERENCE GUIDELINES ---
${guidelines}

--- EXPERIMENTAL LOG (Data Truth) ---
${experimentalLog}

--- CITATION MAP (Reference Truth) ---
${citations}

--- CURRENT LATEX SOURCE ---
${currentTex}

INSTRUCTION: 
1. Your goal is to IMPROVE the reviewer score (Current: ${currentScore}).
2. Address the 'Weaknesses' and 'Questions' in the Reviewer Feedback above.
3. Output the JSON Worklog first, then the Full Revised LaTeX.`;

    log(` >> Calling Refinement Agent...\n`);
    try {
      const response = await callGeminiWithRetry({
        modelName: opts.modelName,
        systemInstruction: CONTENT_REFINEMENT_AGENT_SYSTEM_PROMPT,
        contents: [{ text: userPromptText }],
        parser: (raw) => parseGeminiJsonLatexResponse(raw),
        requireParsed: true,
      });

      const parsed = response.parsedResponse;
      if (!parsed.latex) {
        log(` >> Error: No LaTeX generated.\n`);
        break;
      }

      fs.writeFileSync(curTexPath, parsed.latex, "utf-8");
      const screenshotsDir = path.join(
        opts.workDir,
        "pdf_screenshots",
        "content_refinement",
        `v${i + 1}`
      );
      await buildPdfFromLatex(
        parsed.latex,
        opts.workDir,
        curPdfPath,
        screenshotsDir
      );
      log(` >> New PDF saved to ${curPdfPath}\n`);

      log(` >> [AgentReview] Generating feedback for v${i + 1} paper...\n`);
      const newReview = await performReviewAgentReview({
        paperText: extractPlainPaperText(parsed.latex),
        modelName: opts.modelName,
        numEnsemble: 2,
        onLog: log,
      });
      const newScore = Number(newReview.Overall ?? 0);
      log(` >> [Reviewer] Score for v${i + 1}: ${newScore}/10\n`);
      fs.writeFileSync(
        path.join(opts.workDir, "peer_reviews", `review_v${i + 1}.json`),
        JSON.stringify(newReview, null, 4),
        "utf-8"
      );

      const oldMetrics = extractScores(currentPeerReview);
      const newMetrics = extractScores(newReview);

      let totalGain = 0;
      let totalDrop = 0;
      const deltas: Record<string, number> = {};
      for (const k of Object.keys(newMetrics)) {
        if (k === "Overall" || k === "Confidence") continue;
        const delta = newMetrics[k] - oldMetrics[k];
        deltas[k] = delta;
        if (delta > 0) totalGain += delta;
        else if (delta < 0) totalDrop += Math.abs(delta);
      }

      const logEntry: Record<string, any> = {
        round: i + 1,
        agent_plan: parsed.json,
        scores_before: oldMetrics,
        scores_after: newMetrics,
        deltas,
        total_gain: totalGain,
        total_drop: totalDrop,
        outcome: "UNKNOWN",
      };

      log(` >> Score Analysis v${i + 1}: Overall ${oldMetrics.Overall} -> ${newMetrics.Overall} (+${totalGain} / -${totalDrop})\n`);

      if (newMetrics.Overall > oldMetrics.Overall) {
        log(` >> SUCCESS: Overall Score increased!\n`);
        logEntry.outcome = "ACCEPTED_SCORE_INCREASE";
        worklogs[`v${i + 1}`] = logEntry;
        currentTex = parsed.latex;
        currentScore = newScore;
        currentPeerReview = newReview;
        finalValidPdfPath = curPdfPath;
        fs.writeFileSync(
          worklogSavePath,
          JSON.stringify(worklogs, null, 4),
          "utf-8"
        );
      } else if (newMetrics.Overall < oldMetrics.Overall) {
        log(` >> STOP: Overall Score decreased. Reverting to previous iteration.\n`);
        logEntry.outcome = "REJECTED_SCORE_DECREASE";
        worklogs[`v${i + 1}`] = logEntry;
        fs.writeFileSync(
          worklogSavePath,
          JSON.stringify(worklogs, null, 4),
          "utf-8"
        );
        break;
      } else if (totalDrop > totalGain) {
        log(` >> STOP: Sub-axes degraded (Drop > Gain). Reverting.\n`);
        logEntry.outcome = "REJECTED_DEGRADATION";
        worklogs[`v${i + 1}`] = logEntry;
        fs.writeFileSync(
          worklogSavePath,
          JSON.stringify(worklogs, null, 4),
          "utf-8"
        );
        break;
      } else {
        log(` >> ACCEPT & CONTINUE: Internal metrics stable/improved.\n`);
        logEntry.outcome = "ACCEPTED_NEUTRAL_IMPROVEMENT";
        worklogs[`v${i + 1}`] = logEntry;
        currentTex = parsed.latex;
        currentScore = newScore;
        currentPeerReview = newReview;
        finalValidPdfPath = curPdfPath;
        fs.writeFileSync(
          worklogSavePath,
          JSON.stringify(worklogs, null, 4),
          "utf-8"
        );
      }
    } catch (err) {
      log(
        ` >> Error during refinement loop: ${
          err instanceof Error ? err.message : String(err)
        }\n`
      );
      break;
    }
  }

  // --- Formatting Phase ---
  fs.writeFileSync(
    path.join(opts.workDir, "format_candidate_v0.tex"),
    currentTex,
    "utf-8"
  );
  const formatV0Screenshots = path.join(
    opts.workDir,
    "pdf_screenshots",
    "format_refinement",
    "v0"
  );
  await buildPdfFromLatex(
    currentTex,
    opts.workDir,
    path.join(opts.workDir, "format_candidate_v0.pdf"),
    formatV0Screenshots
  );

  log(` >> Starting dedicated formatting loop...\n`);
  try {
    const gridImages = fs.existsSync(formatV0Screenshots)
      ? fs
          .readdirSync(formatV0Screenshots)
          .filter((f) => f.endsWith(".png"))
          .map((f) => ({
            inlineData: {
              mimeType: "image/png",
              data: fs
                .readFileSync(path.join(formatV0Screenshots, f))
                .toString("base64"),
            },
          }))
      : [];

    const fmtPrompt = `Analyze the provided page images and LaTeX source of a research paper for formatting issues against the conference guidelines.
Formatting Guidelines:
${guidelines}

LaTeX Source (excerpt):
${currentTex.slice(0, 18000)}

Respond in JSON format:
\`\`\`json
{
  "figure_and_tables": {
    "Figure 1": { "detected_issue": "None", "suggested_fix": "None" }
  },
  "other_issues": []
}
\`\`\``;

    const fmtReviewRes = await callGeminiWithRetry({
      modelName: opts.modelName,
      contents: [{ text: fmtPrompt }, ...gridImages],
      parser: parseGeminiJsonResults,
      requireParsed: true,
    });

    const formattingReview = fmtReviewRes.parsedResponse;
    let hasIssues = false;

    const figTabs = formattingReview?.figure_and_tables;
    if (figTabs && typeof figTabs === "object") {
      for (const details of Object.values(figTabs) as any[]) {
        const issue = String(details?.detected_issue ?? "");
        if (issue && issue.toLowerCase() !== "none") {
          hasIssues = true;
          break;
        }
      }
    }
    if (!hasIssues && Array.isArray(formattingReview?.other_issues)) {
      for (const item of formattingReview.other_issues) {
        const issue =
          typeof item === "string" ? item : String(item?.detected_issue ?? "");
        if (issue && issue.toLowerCase() !== "none") {
          hasIssues = true;
          break;
        }
      }
    }

    if (hasIssues) {
      log(` >> [VLM] Found formatting issues. Polishing layout...\n`);
      const fixPrompt = `You are a LaTeX formatting expert. Fix ONLY the formatting, layout, and spacing issues identified below without altering any content or data.

--- FORMATTING FEEDBACK ---
${JSON.stringify(formattingReview, null, 2)}

--- CONFERENCE GUIDELINES ---
${guidelines}

--- CURRENT LATEX SOURCE ---
${currentTex}

Output the Full Revised LaTeX wrapped in \`\`\`latex ... \`\`\`.`;

      const fixedRes = await callGeminiWithRetry({
        modelName: opts.modelName,
        contents: [{ text: fixPrompt }],
        parser: parseGeminiLatexResults,
        requireParsed: true,
      });

      const candidateTexPath = path.join(
        opts.workDir,
        "formatted_candidate_v1.tex"
      );
      const candidatePdfPath = path.join(
        opts.workDir,
        "formatted_candidate_v1.pdf"
      );
      const candidateShots = path.join(
        opts.workDir,
        "pdf_screenshots",
        "format_refinement",
        "v1"
      );

      fs.writeFileSync(candidateTexPath, fixedRes.parsedResponse, "utf-8");
      await buildPdfFromLatex(
        fixedRes.parsedResponse,
        opts.workDir,
        candidatePdfPath,
        candidateShots
      );

      currentTex = fixedRes.parsedResponse;
      finalValidPdfPath = candidatePdfPath;
      formatWorklogs.v1 = {
        outcome: "ACCEPTED_COMPILE_SUCCESS",
        formatting_feedback: formattingReview,
      };
    } else {
      log(` >> No critical formatting issues found.\n`);
      formatWorklogs.v1 = {
        outcome: "ACCEPTED_COMPILE_SUCCESS",
        formatting_feedback: formattingReview,
      };
    }

    fs.writeFileSync(
      path.join(opts.workDir, "format_refinement_worklog.json"),
      JSON.stringify(formatWorklogs, null, 4),
      "utf-8"
    );
  } catch (err) {
    log(
      ` >> Formatting check note: ${
        err instanceof Error ? err.message : String(err)
      }\n`
    );
  }

  const finalPdfOutputPath = path.join(opts.workDir, "final_refined_paper.pdf");
  const finalTexOutputPath = path.join(opts.workDir, "final_refined_paper.tex");
  fs.writeFileSync(finalTexOutputPath, currentTex, "utf-8");

  if (fs.existsSync(finalValidPdfPath)) {
    fs.copyFileSync(finalValidPdfPath, finalPdfOutputPath);
  } else {
    await buildPdfFromLatex(currentTex, opts.workDir, finalPdfOutputPath);
  }

  log(
    ` >> Process Complete. Final Score: ${currentScore}, Final PDF at: ${finalPdfOutputPath}\n`
  );
  return finalPdfOutputPath;
}
