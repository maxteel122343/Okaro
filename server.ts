import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import {
  createLatexZip,
  runsStore,
  startPaperOrchestraRun,
  type UploadedFigureInput,
} from "./server/pipeline.ts";

const PROJECT_ROOT = process.cwd();
const PORT = 3000;
const HOST = "0.0.0.0";

function safeReadJson(filePath: string): any | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function listPngsInDir(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".png") || f.endsWith(".jpg"))
    .sort();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/examples/cvpr", (_req, res) => {
    const jsonPath = path.join(PROJECT_ROOT, "examples", "cvpr_example.json");
    if (!fs.existsSync(jsonPath)) {
      res.status(404).json({ error: "CVPR example file not found." });
      return;
    }
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    res.json({
      idea: data.idea ?? "",
      log: data.log ?? "",
      figureName: data.figure_path ?? "cvpr_example_figure.png",
      figureCaption: data.figure_caption ?? "",
      figureUrl: "/api/examples/cvpr/figure",
    });
  });

  app.get("/api/examples/cvpr/figure", (_req, res) => {
    const figPath = path.join(
      PROJECT_ROOT,
      "examples",
      "cvpr_example_figure.png"
    );
    if (!fs.existsSync(figPath)) {
      res.status(404).end();
      return;
    }
    res.sendFile(figPath);
  });

  app.post("/api/runs", async (req, res) => {
    try {
      const {
        idea,
        log,
        email,
        selectedModel = "gemini-3.1-pro-preview",
        selectedTemplate = "cvpr2025",
        enablePlotting = true,
        figures = [],
      } = req.body ?? {};

      if (
        !idea ||
        !String(idea).trim() ||
        !log ||
        !String(log).trim() ||
        !email ||
        !String(email).trim()
      ) {
        res.status(400).json({
          error: "❌ Please fill in all required fields (Idea, Log, and Email).",
        });
        return;
      }

      const templateDir = path.join(
        PROJECT_ROOT,
        "templates",
        String(selectedTemplate)
      );
      if (!fs.existsSync(templateDir)) {
        res.status(400).json({ error: "Invalid conference template selected." });
        return;
      }

      const id = crypto.randomUUID();
      const state = await startPaperOrchestraRun(
        {
          id,
          idea: String(idea),
          log: String(log),
          email: String(email),
          selectedModel: String(selectedModel),
          selectedTemplate: String(selectedTemplate),
          enablePlotting: Boolean(enablePlotting),
          figures: Array.isArray(figures)
            ? (figures as UploadedFigureInput[])
            : [],
        },
        PROJECT_ROOT
      );

      res.json({ id, state });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to start run",
      });
    }
  });

  app.get("/api/runs/:id", (req, res) => {
    const state = runsStore.get(req.params.id);
    if (!state) {
      res.status(404).json({ error: "Run not found." });
      return;
    }

    const dir = state.runDirectory;
    const outline = safeReadJson(path.join(dir, "outline.json"));
    const citationMap = safeReadJson(
      path.join(dir, "literature_agent_output", "citation_map.json")
    );
    const plottingResultsRaw = safeReadJson(
      path.join(dir, "plotting_results.json")
    );
    const generatedFigures = Array.isArray(plottingResultsRaw)
      ? plottingResultsRaw.map((fig: any) => ({
          ...fig,
          imageUrl: fig.image_path
            ? `/api/runs/${state.id}/files/${fig.image_path}`
            : null,
        }))
      : [];

    const refinementWorkdir = path.join(dir, "content_refinement_workdir");
    const contentWorklog = safeReadJson(
      path.join(refinementWorkdir, "content_refinement_worklog.json")
    );
    const formatWorklog = safeReadJson(
      path.join(refinementWorkdir, "format_refinement_worklog.json")
    );

    const hasFinalPdf = fs.existsSync(path.join(dir, "final_paper.pdf"));
    const hasLatexDir = fs.existsSync(path.join(dir, "latex_writeup"));
    const hasInitialPdf = fs.existsSync(
      path.join(refinementWorkdir, "initial_draft.pdf")
    );

    const v0Snapshots = listPngsInDir(
      path.join(refinementWorkdir, "pdf_screenshots", "content_refinement", "v0")
    ).map(
      (f) =>
        `/api/runs/${state.id}/files/content_refinement_workdir/pdf_screenshots/content_refinement/v0/${f}`
    );

    const contentVersions: Record<string, any> = {};
    if (contentWorklog && typeof contentWorklog === "object") {
      for (const [k, entry] of Object.entries(contentWorklog)) {
        const shots = listPngsInDir(
          path.join(
            refinementWorkdir,
            "pdf_screenshots",
            "content_refinement",
            k
          )
        ).map(
          (f) =>
            `/api/runs/${state.id}/files/content_refinement_workdir/pdf_screenshots/content_refinement/${k}/${f}`
        );
        contentVersions[k] = {
          ...(entry as Record<string, any>),
          hasPdf: fs.existsSync(
            path.join(refinementWorkdir, `refined_paper_${k}.pdf`)
          ),
          snapshots: shots,
        };
      }
    }

    const formatV0Snapshots = listPngsInDir(
      path.join(refinementWorkdir, "pdf_screenshots", "format_refinement", "v0")
    ).map(
      (f) =>
        `/api/runs/${state.id}/files/content_refinement_workdir/pdf_screenshots/format_refinement/v0/${f}`
    );

    const formatVersions: Record<string, any> = {};
    if (formatWorklog && typeof formatWorklog === "object") {
      for (const [k, entry] of Object.entries(formatWorklog)) {
        const shots = listPngsInDir(
          path.join(
            refinementWorkdir,
            "pdf_screenshots",
            "format_refinement",
            k
          )
        ).map(
          (f) =>
            `/api/runs/${state.id}/files/content_refinement_workdir/pdf_screenshots/format_refinement/${k}/${f}`
        );
        formatVersions[k] = {
          ...(entry as Record<string, any>),
          hasPdf: fs.existsSync(
            path.join(refinementWorkdir, `formatted_candidate_${k}.pdf`)
          ),
          snapshots: shots,
        };
      }
    }

    res.json({
      state,
      artifacts: {
        outline,
        citationMap,
        generatedFigures,
        hasFinalPdf,
        hasLatexDir,
        hasInitialPdf,
        v0Snapshots,
        contentVersions,
        formatV0Snapshots,
        formatVersions,
      },
    });
  });

  app.get("/api/runs/:id/download/pdf", (req, res) => {
    const state = runsStore.get(req.params.id);
    if (!state) {
      res.status(404).json({ error: "Run not found." });
      return;
    }

    const version = String(req.query.version || "final");
    const refinementDir = path.join(
      state.runDirectory,
      "content_refinement_workdir"
    );

    let targetPath = path.join(state.runDirectory, "final_paper.pdf");
    let downloadName = "final_paper.pdf";

    if (version === "initial") {
      targetPath = path.join(refinementDir, "initial_draft.pdf");
      downloadName = "initial_draft.pdf";
    } else if (/^v\d+$/.test(version)) {
      targetPath = path.join(refinementDir, `refined_paper_${version}.pdf`);
      downloadName = `refined_paper_${version}.pdf`;
    } else if (/^fmt_v\d+$/.test(version)) {
      const k = version.replace("fmt_", "");
      targetPath = path.join(refinementDir, `formatted_candidate_${k}.pdf`);
      downloadName = `formatted_candidate_${k}.pdf`;
    } else if (version === "fmt_v0") {
      targetPath = path.join(refinementDir, "format_candidate_v0.pdf");
      downloadName = "format_candidate_v0.pdf";
    }

    if (!fs.existsSync(targetPath)) {
      res.status(404).json({ error: "Requested PDF not found." });
      return;
    }

    res.download(targetPath, downloadName);
  });

  app.get("/api/runs/:id/download/latex", async (req, res) => {
    const state = runsStore.get(req.params.id);
    if (!state) {
      res.status(404).json({ error: "Run not found." });
      return;
    }

    let zipPath = path.join(state.runDirectory, "latex_source.zip");
    if (!fs.existsSync(zipPath)) {
      const created = await createLatexZip(state.runDirectory);
      if (!created) {
        res.status(404).json({ error: "LaTeX source directory not ready." });
        return;
      }
      zipPath = created;
    }

    res.download(zipPath, "latex_source.zip");
  });

  app.get("/api/runs/:id/files/*filepath", (req, res) => {
    const state = runsStore.get(req.params.id);
    if (!state) {
      res.status(404).end();
      return;
    }

    const rawParam = (req.params as Record<string, string | string[]>).filepath;
    const rel = Array.isArray(rawParam) ? rawParam.join("/") : String(rawParam || "");
    const resolvedBase = path.resolve(state.runDirectory);
    const resolvedTarget = path.resolve(resolvedBase, rel);

    if (
      !resolvedTarget.startsWith(resolvedBase + path.sep) ||
      !fs.existsSync(resolvedTarget)
    ) {
      res.status(404).end();
      return;
    }

    res.sendFile(resolvedTarget);
  });

  if (process.env.NODE_ENV === "production") {
    const distDir = path.join(PROJECT_ROOT, "dist");
    app.use(express.static(distDir));
    app.get("*splat", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, HOST, () => {
    console.log(`Paper Orchestra server running at http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start Paper Orchestra server:", err);
  process.exit(1);
});
