import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  callGeminiWithRetry,
  generateImageWithGemini,
  parseGeminiJsonResults,
} from "../gemini.ts";
import {
  DIAGRAM_CRITIC_PROMPT,
  DIAGRAM_PLANNER_PROMPT,
  DIAGRAM_STYLIST_PROMPT,
  PLOT_CRITIC_PROMPT,
  PLOT_PLANNER_PROMPT,
  PLOT_STYLIST_PROMPT,
} from "../prompts.ts";

export interface PlottingResult {
  figure_id: string;
  title: string;
  task_name: "plot" | "diagram";
  description: string;
  caption: string;
  aspect_ratio: string;
  critic_history: Array<{
    round: number;
    suggestions: string;
    revised_description: string;
  }>;
  image_path?: string;
}

function extractSvg(raw: string): string | null {
  const fenced = raw.match(/```(?:svg|xml)?\s*([\s\S]*?<svg[\s\S]*?<\/svg>)\s*```/i);
  if (fenced) return fenced[1].trim();
  const inline = raw.match(/<svg[\s\S]*?<\/svg>/i);
  return inline ? inline[0].trim() : null;
}

async function generatePlotSvgAsBase64Jpeg(
  description: string,
  modelName: string
): Promise<string | null> {
  const prompt = `Generate a clean, publication-ready standalone SVG statistical plot based on the following detailed description.
Requirements:
- Valid standalone SVG with explicit width="1200" height="675" viewBox="0 0 1200 675" and white background <rect width="1200" height="675" fill="#ffffff"/>.
- Use crisp Helvetica/Arial fonts, readable axis ticks, clear legend, colorblind-safe palette, and exact numerical labels from the description.
- Output ONLY the SVG code inside \`\`\`svg ... \`\`\`.

Detailed Description:
${description}`;

  const res = await callGeminiWithRetry({
    modelName,
    contents: [{ text: prompt }],
    parser: (raw) => extractSvg(raw),
    requireParsed: true,
    maxRetries: 2,
  });

  if (!res.parsedResponse) return null;
  const jpegBuf = await sharp(Buffer.from(res.parsedResponse))
    .jpeg({ quality: 92 })
    .toBuffer();
  return jpegBuf.toString("base64");
}

async function processSingleFigure({
  figPlan,
  rawMaterialsDir,
  modelName,
  imageModelName,
  maxCriticRounds,
  onLog,
}: {
  figPlan: any;
  rawMaterialsDir: string;
  modelName: string;
  imageModelName: string;
  maxCriticRounds: number;
  onLog: (msg: string) => void;
}): Promise<{ result: PlottingResult; base64Img: string | null }> {
  const figId = figPlan.figure_id || "fig_generated";
  const title = figPlan.title || figId;
  const plotType = String(figPlan.plot_type || "").toLowerCase();
  const dataSourceStr = String(figPlan.data_source || "").toLowerCase();
  const objective = figPlan.objective || "";
  const aspectRatio = figPlan.aspect_ratio || "16:9";

  const taskName: "plot" | "diagram" =
    plotType === "plot" || plotType.includes("chart") || plotType.includes("plot")
      ? "plot"
      : "diagram";

  onLog(`Processing figure: ${figId}\n`);

  let rawContent = "";
  for (const filename of fs.readdirSync(rawMaterialsDir)) {
    if (!filename.endsWith(".md")) continue;
    const lower = filename.toLowerCase();
    const match =
      (dataSourceStr.includes("idea") && lower.includes("idea")) ||
      (dataSourceStr.includes("experiment") && lower.includes("experiment")) ||
      dataSourceStr.includes(lower);
    if (match) {
      rawContent += `\n--- ${filename} ---\n${fs.readFileSync(
        path.join(rawMaterialsDir, filename),
        "utf-8"
      )}`;
    }
  }
  if (!rawContent) {
    for (const filename of ["experimental_log.md", "idea_sparse.md"]) {
      const p = path.join(rawMaterialsDir, filename);
      if (fs.existsSync(p)) {
        rawContent += `\n--- ${filename} ---\n${fs.readFileSync(p, "utf-8")}`;
      }
    }
  }

  const visualIntent = `Title: ${title}\nObjective: ${objective}`;

  onLog(`[${figId}] Planning figure content...\n`);
  const plannerPrompt =
    taskName === "plot" ? PLOT_PLANNER_PROMPT : DIAGRAM_PLANNER_PROMPT;
  const planRes = await callGeminiWithRetry({
    modelName,
    systemInstruction: plannerPrompt,
    contents: [
      {
        text: `Raw Context:\n${rawContent}\n\nVisual Intent:\n${visualIntent}\n\nProvide a detailed description of the figure to be generated (do not include figure titles).`,
      },
    ],
    parser: (raw) => raw.trim(),
    requireParsed: true,
  });

  onLog(`[${figId}] Styling figure content...\n`);
  const stylistPrompt =
    taskName === "plot" ? PLOT_STYLIST_PROMPT : DIAGRAM_STYLIST_PROMPT;
  const styledRes = await callGeminiWithRetry({
    modelName,
    systemInstruction: stylistPrompt,
    contents: [
      {
        text: `Detailed Description:\n${planRes.parsedResponse}\n\nContext:\n${rawContent}\n\nVisual Intent:\n${visualIntent}\n\nOutput ONLY the final polished Detailed Description.`,
      },
    ],
    parser: (raw) => raw.trim(),
    requireParsed: true,
  });

  let currentDescription = styledRes.parsedResponse;

  onLog(
    `[${figId}] Generating initial visual with aspect ratio ${aspectRatio}...\n`
  );

  let currentImg: string | null = null;
  if (taskName === "plot") {
    try {
      currentImg = await generatePlotSvgAsBase64Jpeg(
        currentDescription,
        modelName
      );
    } catch (err) {
      onLog(
        `[${figId}] Plot SVG generation warning: ${
          err instanceof Error ? err.message : String(err)
        }\n`
      );
    }
  } else {
    try {
      currentImg = await generateImageWithGemini({
        modelName: imageModelName,
        prompt: `Render a clean academic architecture diagram based on the following description. Do not include figure titles in the image.\n${currentDescription}`,
        systemInstruction:
          "You are an expert scientific diagram illustrator. Generate high-quality scientific diagrams.",
        aspectRatio,
      });
    } catch (err) {
      onLog(
        `[${figId}] Image model unavailable (${
          err instanceof Error ? err.message : String(err)
        }), falling back to SVG diagram rendering...\n`
      );
      try {
        currentImg = await generatePlotSvgAsBase64Jpeg(
          currentDescription,
          modelName
        );
      } catch {
        currentImg = null;
      }
    }
  }

  const criticHistory: PlottingResult["critic_history"] = [];
  const rounds = Math.min(maxCriticRounds, 2);

  for (let r = 0; r < rounds; r++) {
    onLog(`[${figId}] Running critic round ${r + 1}/${rounds}...\n`);
    try {
      const criticPrompt =
        taskName === "plot" ? PLOT_CRITIC_PROMPT : DIAGRAM_CRITIC_PROMPT;
      const parts: any[] = [
        {
          text: `${criticPrompt}\n\nDetailed Description: ${currentDescription}\nContext: ${rawContent.slice(
            0,
            6000
          )}\nVisual Intent: ${visualIntent}`,
        },
      ];
      if (currentImg) {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: currentImg,
          },
        });
      }

      const criticRes = await callGeminiWithRetry({
        modelName,
        contents: parts,
        parser: parseGeminiJsonResults,
        requireParsed: false,
      });

      const suggestions = String(
        criticRes.parsedResponse?.critic_suggestions ?? "No changes needed."
      );
      const revised = String(
        criticRes.parsedResponse?.revised_description ?? "No changes needed."
      );

      criticHistory.push({
        round: r,
        suggestions,
        revised_description: revised,
      });

      if (suggestions.trim() === "No changes needed.") {
        onLog(`[${figId}] Critic round ${r + 1}: No changes needed.\n`);
        break;
      }

      if (revised.trim() && revised.trim() !== "No changes needed.") {
        currentDescription = revised;
        if (taskName === "plot") {
          const regenerated = await generatePlotSvgAsBase64Jpeg(
            currentDescription,
            modelName
          );
          if (regenerated) currentImg = regenerated;
        }
      }
    } catch {
      break;
    }
  }

  onLog(`[${figId}] Generating caption...\n`);
  const capRes = await callGeminiWithRetry({
    modelName,
    contents: [
      {
        text: `Write a concise academic figure caption (plain text, NO "Figure X:" prefix, NO markdown) for this ${taskName}.\nOverall Intent: ${visualIntent}\nDetailed Description: ${currentDescription}`,
      },
    ],
    parser: (raw) =>
      raw
        .trim()
        .replace(/^(\*\*Caption:\*\*|Caption:)\s*/i, "")
        .trim(),
    requireParsed: true,
  });

  onLog(`[${figId}] Figure processing complete.\n`);

  return {
    result: {
      figure_id: figId,
      title,
      task_name: taskName,
      description: currentDescription,
      caption: capRes.parsedResponse,
      aspect_ratio: aspectRatio,
      critic_history: criticHistory,
    },
    base64Img: currentImg,
  };
}

export interface PlottingAgentOptions {
  outlineJsonPath: string;
  rawMaterialsDir: string;
  outputFilepath: string;
  modelName: string;
  imageModelName: string;
  maxCriticRounds?: number;
  onLog?: (msg: string) => void;
}

export async function runPlottingAgent(
  opts: PlottingAgentOptions
): Promise<PlottingResult[]> {
  const log = opts.onLog ?? (() => {});
  log(`[DEBUG] Starting run_plotting_agent\n`);

  const outlineData = JSON.parse(fs.readFileSync(opts.outlineJsonPath, "utf-8"));
  const plottingPlan: any[] = Array.isArray(outlineData?.plotting_plan)
    ? outlineData.plotting_plan
    : [];

  const outputDir = path.dirname(opts.outputFilepath);
  const figuresDir = path.join(outputDir, "figures");
  fs.mkdirSync(figuresDir, { recursive: true });

  const processed = await Promise.all(
    plottingPlan.slice(0, 4).map(async (plan) => {
      try {
        return await processSingleFigure({
          figPlan: plan,
          rawMaterialsDir: opts.rawMaterialsDir,
          modelName: opts.modelName,
          imageModelName: opts.imageModelName,
          maxCriticRounds: opts.maxCriticRounds ?? 2,
          onLog: log,
        });
      } catch (err) {
        log(
          `[ERROR] Failed processing ${plan?.figure_id ?? "figure"}: ${
            err instanceof Error ? err.message : String(err)
          }\n`
        );
        return null;
      }
    })
  );

  const results: PlottingResult[] = [];
  for (const item of processed) {
    if (!item) continue;
    if (item.base64Img) {
      const cleanId = item.result.figure_id.replace(/\s+/g, "_").toLowerCase();
      const imgFile = path.join(figuresDir, `${cleanId}.jpg`);
      fs.writeFileSync(imgFile, Buffer.from(item.base64Img, "base64"));
      item.result.image_path = `figures/${cleanId}.jpg`;
      log(`Saved figures/${cleanId}.jpg\n`);
    }
    results.push(item.result);
  }

  fs.writeFileSync(
    opts.outputFilepath,
    JSON.stringify(results, null, 4),
    "utf-8"
  );
  return results;
}
