import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { runOutlineAgent } from "./agents/outlineAgent.ts";
import { runLiteratureReviewAgent } from "./agents/literatureReviewAgent.ts";
import { runPlottingAgent, type PlottingResult } from "./agents/plottingAgent.ts";
import { runSectionWritingAgent } from "./agents/sectionWritingAgent.ts";
import { runContentRefinementAgent } from "./agents/contentRefinementAgent.ts";
import { sendNotificationEmail } from "./email.ts";
import { saveRun, getRun } from "./persistence.ts";

export interface UploadedFigureInput {
  name: string;
  caption: string;
  dataBase64?: string;
  examplePath?: string;
}

export interface RunConfig {
  id: string;
  idea: string;
  log: string;
  email: string;
  selectedModel: string;
  selectedTemplate: string;
  enablePlotting: boolean;
  figures: UploadedFigureInput[];
}

export interface RunState {
  id: string;
  running: boolean;
  currentStep: number; // 0..4 (4 == complete)
  failed: boolean;
  errorMessage: string;
  runDirectory: string;
  selectedModel: string;
  selectedTemplate: string;
  enablePlotting: boolean;
  idea: string;
  log: string;
  figures: Array<{ name: string; caption: string; url: string }>;
  logs: {
    "Outline Generation": string;
    "Literature Review": string;
    "Figure Plotting": string;
    "Section Writing": string;
    "Content Refinement": string;
  };
  createdAt: string;
}

// Mantido para compatibilidade temporária; a fonte de verdade agora é a persistência
export const runsStore = new Map<string, RunState>();

function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function addDirToZip(zip: JSZip, dirPath: string, rootDir: string) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(rootDir, fullPath);
    if (entry.isDirectory()) {
      await addDirToZip(zip, fullPath, rootDir);
    } else {
      zip.file(relPath, fs.readFileSync(fullPath));
    }
  }
}

export async function createLatexZip(runDir: string): Promise<string | null> {
  const latexWriteup = path.join(runDir, "latex_writeup");
  const finalTex = path.join(
    runDir,
    "content_refinement_workdir",
    "final_refined_paper.tex"
  );
  if (!fs.existsSync(latexWriteup)) return null;

  const zip = new JSZip();
  await addDirToZip(zip, latexWriteup, latexWriteup);
  zip.remove("template.tex");
  zip.remove("raw_draft_paper.tex");

  if (fs.existsSync(finalTex)) {
    zip.file("main.tex", fs.readFileSync(finalTex));
  }

  const zipOut = path.join(runDir, "latex_source.zip");
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(zipOut, buf);
  return zipOut;
}

export async function startPaperOrchestraRun(
  config: RunConfig,
  projectRoot: string
): Promise<RunState> {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15);
  const runDirectory = path.join(
    projectRoot,
    "demo_logs",
    `paper_orchestra_run_${timestamp}_${config.id.slice(0, 6)}`
  );
  const rawMaterialsDir = path.join(runDirectory, "raw_materials");
  const figuresDir = path.join(rawMaterialsDir, "figures");
  fs.mkdirSync(figuresDir, { recursive: true });

  fs.writeFileSync(
    path.join(rawMaterialsDir, "idea_sparse.md"),
    config.idea,
    "utf-8"
  );
  fs.writeFileSync(
    path.join(rawMaterialsDir, "experimental_log.md"),
    config.log,
    "utf-8"
  );

  const savedFigures: Array<{ name: string; caption: string; url: string }> =
    [];
  const rawInfoJson: Array<{ name: string; caption: string }> = [];

  for (const fig of config.figures) {
    const safeName = path.basename(fig.name);
    const destPath = path.join(figuresDir, safeName);
    if (fig.dataBase64) {
      const cleaned = fig.dataBase64.replace(/^data:[^;]+;base64,/, "");
      fs.writeFileSync(destPath, Buffer.from(cleaned, "base64"));
    } else if (fig.examplePath) {
      const srcExample = path.join(
        projectRoot,
        "examples",
        path.basename(fig.examplePath)
      );
      if (fs.existsSync(srcExample)) {
        fs.copyFileSync(srcExample, destPath);
      }
    }
    if (fs.existsSync(destPath)) {
      rawInfoJson.push({ name: safeName, caption: fig.caption });
      savedFigures.push({
        name: safeName,
        caption: fig.caption,
        url: `/api/runs/${config.id}/files/raw_materials/figures/${encodeURIComponent(
          safeName
        )}`,
      });
    }
  }

  fs.writeFileSync(
    path.join(figuresDir, "info.json"),
    JSON.stringify(rawInfoJson, null, 4),
    "utf-8"
  );

  const state: RunState = {
    id: config.id,
    running: true,
    currentStep: 0,
    failed: false,
    errorMessage: "",
    runDirectory,
    selectedModel: config.selectedModel,
    selectedTemplate: config.selectedTemplate,
    enablePlotting: config.enablePlotting,
    idea: config.idea,
    log: config.log,
    figures: savedFigures,
    logs: {
      "Outline Generation": "",
      "Literature Review": "",
      "Figure Plotting": "",
      "Section Writing": "",
      "Content Refinement": "",
    },
    createdAt: now.toISOString(),
  };

  runsStore.set(config.id, state);
  await saveRun(state);

  // Execute asynchronously in background
  void executePipeline(state, config, projectRoot);

  return state;
}

async function executePipeline(
  state: RunState,
  config: RunConfig,
  projectRoot: string
): Promise<void> {
  const { runDirectory } = state;
  const latexTemplateDir = path.join(
    projectRoot,
    "templates",
    config.selectedTemplate
  );
  const latexWriteupDir = path.join(runDirectory, "latex_writeup");
  const rawMaterialsDir = path.join(runDirectory, "raw_materials");
  const writeupFiguresDir = path.join(latexWriteupDir, "figures");
  const cutoffDate = new Date().toISOString().slice(0, 7);

  const persist = async () => {
    runsStore.set(state.id, state);
    await saveRun(state).catch((e) =>
      console.error("Failed to persist run state:", e)
    );
  };

  try {
    copyDirRecursive(latexTemplateDir, latexWriteupDir);
    copyDirRecursive(
      path.join(rawMaterialsDir, "figures"),
      writeupFiguresDir
    );

    const guidelinesPath = path.join(latexWriteupDir, "guidelines.md");
    const templatePath = path.join(latexWriteupDir, "template.tex");
    const ideaPath = path.join(rawMaterialsDir, "idea_sparse.md");
    const expLogPath = path.join(rawMaterialsDir, "experimental_log.md");

    // Step 1: Outline Generation
    state.currentStep = 0;
    await persist();
    const outlinePath = path.join(runDirectory, "outline.json");
    await runOutlineAgent({
      modelName: config.selectedModel,
      cutoffDate,
      ideaFile: ideaPath,
      experimentalLogFile: expLogPath,
      latexTemplateFile: templatePath,
      conferenceGuidelinesFile: guidelinesPath,
      outputFilepath: outlinePath,
      onLog: (msg) => {
        state.logs["Outline Generation"] += msg;
      },
    });
    await persist();

    // Step 2: Literature Review (+ Plotting in parallel if enabled)
    state.currentStep = 1;
    await persist();
    const litOutputDir = path.join(runDirectory, "literature_agent_output");

    const litPromise = runLiteratureReviewAgent({
      ideaPath,
      experimentalLogPath: expLogPath,
      latexTemplatePath: templatePath,
      conferenceGuidelinesPath: guidelinesPath,
      outputDir: litOutputDir,
      outlinePath,
      modelName: config.selectedModel,
      cutoffDate,
      onLog: (msg) => {
        state.logs["Literature Review"] += msg;
      },
    });

    let plotResults: PlottingResult[] = [];
    if (config.enablePlotting) {
      const plottingResultsPath = path.join(runDirectory, "plotting_results.json");
      const plotPromise = runPlottingAgent({
        outlineJsonPath: outlinePath,
        rawMaterialsDir,
        outputFilepath: plottingResultsPath,
        modelName: config.selectedModel,
        imageModelName: "gemini-3-pro-image-preview",
        maxCriticRounds: 2,
        onLog: (msg) => {
          state.logs["Figure Plotting"] += msg;
        },
      });
      const [, plots] = await Promise.all([litPromise, plotPromise]);
      plotResults = plots;
    } else {
      await litPromise;
    }
    await persist();

    // Merge generated figures info with uploaded figures info
    const existingInfoPath = path.join(writeupFiguresDir, "info.json");
    const existingInfo: Array<{ name: string; caption: string }> = fs.existsSync(
      existingInfoPath
    )
      ? JSON.parse(fs.readFileSync(existingInfoPath, "utf-8"))
      : [];

    for (const plotObj of plotResults) {
      if (plotObj.image_path) {
        const srcPlot = path.join(runDirectory, plotObj.image_path);
        const dstPlot = path.join(latexWriteupDir, plotObj.image_path);
        if (fs.existsSync(srcPlot)) {
          fs.mkdirSync(path.dirname(dstPlot), { recursive: true });
          fs.copyFileSync(srcPlot, dstPlot);
          existingInfo.push({
            name: path.basename(dstPlot),
            caption: plotObj.caption || "",
          });
        }
      }
    }
    fs.writeFileSync(
      existingInfoPath,
      JSON.stringify(existingInfo, null, 4),
      "utf-8"
    );

    fs.copyFileSync(
      path.join(litOutputDir, "outline_v1.json"),
      outlinePath
    );
    fs.copyFileSync(
      path.join(litOutputDir, "updated_template.tex"),
      path.join(latexWriteupDir, "template.tex")
    );
    fs.copyFileSync(
      path.join(litOutputDir, "references.bib"),
      path.join(latexWriteupDir, "references.bib")
    );

    // Step 3: Section Writing
    state.currentStep = 2;
    await persist();
    const citationMapPath = path.join(litOutputDir, "citation_map.json");
    const rawDraftTexPath = path.join(latexWriteupDir, "raw_draft_paper.tex");
    await runSectionWritingAgent({
      outlinePath,
      templatePath: path.join(latexWriteupDir, "template.tex"),
      ideaPath,
      experimentalLogPath: expLogPath,
      citationMapPath,
      figuresInfoPath: existingInfoPath,
      guidelinesPath,
      modelName: config.selectedModel,
      outputPath: rawDraftTexPath,
      onLog: (msg) => {
        state.logs["Section Writing"] += msg;
      },
    });
    await persist();

    // Step 4: Content & Format Refinement
    state.currentStep = 3;
    await persist();
    const contentRefinementWorkdir = path.join(
      runDirectory,
      "content_refinement_workdir"
    );
    copyDirRecursive(latexWriteupDir, contentRefinementWorkdir);

    const finalRefinedPdfPath = await runContentRefinementAgent({
      experimentalLogPath: expLogPath,
      citationMapPath,
      guidelinesPath,
      modelName: config.selectedModel,
      maxReflections: 2,
      workDir: contentRefinementWorkdir,
      texfilePath: rawDraftTexPath,
      onLog: (msg) => {
        state.logs["Content Refinement"] += msg;
      },
    });

    const finalPdfPath = path.join(runDirectory, "final_paper.pdf");
    if (fs.existsSync(finalRefinedPdfPath)) {
      fs.copyFileSync(finalRefinedPdfPath, finalPdfPath);
    }

    const zipPath = await createLatexZip(runDirectory);

    if (config.email) {
      const attachments = [finalPdfPath, zipPath].filter(
        (p): p is string => Boolean(p && fs.existsSync(p))
      );
      await sendNotificationEmail(config.email, "Generated Paper", attachments);
    }

    state.currentStep = 4;
    state.running = false;
    await persist();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const activeBucket: keyof RunState["logs"] =
      state.currentStep === 0
        ? "Outline Generation"
        : state.currentStep === 1
        ? "Literature Review"
        : state.currentStep === 2
        ? "Section Writing"
        : "Content Refinement";
    state.logs[activeBucket] += `\n❌ Pipeline error: ${msg}\n`;
    state.failed = true;
    state.errorMessage = msg;
    state.running = false;
    await persist();
  }
}

export async function getRunState(id: string): Promise<RunState | null> {
  const mem = runsStore.get(id);
  if (mem) return mem;
  return getRun(id);
}
