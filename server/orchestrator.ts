/**
 * Okaro — Orchestrator (v0 minimal)
 *
 * Closes the loop: idea → SCAMPER → human review → literature discovery
 * → evidence matrix → paper pipeline input.
 *
 * Each stage produces a versioned asset with provenance.
 * Nothing flows forward without the previous stage's output.
 *
 * Stages:
 *   1. scamper_generate   — seed idea → 7 raw angles
 *   2. scamper_review     — human accepts/rejects lenses (GATE)
 *   3. literature_discover — accepted angles → evidence matrices (OpenAlex)
 *   4. pipeline_input     — matrices + validated angles → structured brief
 *                               for the PaperOrchestra writing pipeline
 */

import {
  buildScamperPrompts,
  assembleSession,
  reviewSession,
  closeSession,
  type ScamperSession,
  type LensLetter,
} from "../skills/scamper";
import {
  runLiteratureDiscovery,
  type EvidenceMatrix,
} from "../agents/literatureDiscovery";

// ─────────────────────────────────────────────
// Pipeline state (persisted per run)
// ─────────────────────────────────────────────

export type StageStatus = "pending" | "running" | "done" | "blocked" | "failed";

export interface OrchestratorRun {
  id: string;
  idea: string;
  created_at: string;
  stages: {
    scamper_generate: StageStatus;
    scamper_review: StageStatus;
    literature_discover: StageStatus;
    pipeline_input: StageStatus;
  };
  scamper_session: ScamperSession | null;
  evidence_matrices: EvidenceMatrix[];
  pipeline_brief: PipelineBrief | null;
  errors: string[];
}

export interface PipelineBrief {
  idea: string;
  validated_angles: { lens: LensLetter; lens_name: string; angle: string }[];
  evidence: {
    lens: LensLetter;
    query: string;
    total_verified: number;
    top_citations: { title: string; doi: string | null; url: string | null; cited_by: number }[];
  }[];
  generated_at: string;
  template_versions: { scamper: string };
}

// ─────────────────────────────────────────────
// Stage 1 — SCAMPER generation
// ─────────────────────────────────────────────

export function startRun(idea: string): OrchestratorRun {
  if (!idea.trim()) throw new Error("Idea cannot be empty");
  return {
    id: `okaro-run-${Date.now()}`,
    idea: idea.trim(),
    created_at: new Date().toISOString(),
    stages: {
      scamper_generate: "pending",
      scamper_review: "pending",
      literature_discover: "pending",
      pipeline_input: "pending",
    },
    scamper_session: null,
    evidence_matrices: [],
    pipeline_brief: null,
    errors: [],
  };
}

/**
 * Stage 1: build the 7 lens prompts for the seed idea.
 * Returns prompts ready to send to an LLM/agent.
 * The run stays in "running" until angles come back.
 */
export function stageScamperGenerate(run: OrchestratorRun): {
  run: OrchestratorRun;
  prompts: ReturnType<typeof buildScamperPrompts>;
} {
  run.stages.scamper_generate = "running";
  const prompts = buildScamperPrompts(run.idea);
  return { run, prompts };
}

/**
 * Stage 1 complete: assemble session from LLM-returned angles.
 * Transitions scamper_generate → done, scamper_review → pending (gate).
 */
export function stageScamperAssemble(
  run: OrchestratorRun,
  angles: { lens: LensLetter; angle: string; rationale: string }[],
): OrchestratorRun {
  try {
    run.scamper_session = assembleSession(run.idea, angles);
    run.stages.scamper_generate = "done";
    run.stages.scamper_review = "pending"; // HUMAN GATE
  } catch (e: any) {
    run.stages.scamper_generate = "failed";
    run.errors.push(`SCAMPER assemble: ${e.message}`);
  }
  return run;
}

// ─────────────────────────────────────────────
// Stage 2 — Human review (GATE)
// ─────────────────────────────────────────────

/**
 * Stage 2: human marks which lenses to accept.
 * BLOCKS all downstream stages until called.
 * This is the only non-automatable step.
 */
export function stageScamperReview(
  run: OrchestratorRun,
  accepted: LensLetter[],
): OrchestratorRun {
  if (!run.scamper_session) {
    run.errors.push("No SCAMPER session to review");
    return run;
  }
  if (accepted.length === 0) {
    run.stages.scamper_review = "blocked";
    run.errors.push("Human rejected all lenses — run stopped");
    return run;
  }
  try {
    run.scamper_session = reviewSession(run.scamper_session, accepted);
    run.stages.scamper_review = "done";
  } catch (e: any) {
    run.stages.scamper_review = "failed";
    run.errors.push(`SCAMPER review: ${e.message}`);
  }
  return run;
}

// ─────────────────────────────────────────────
// Stage 3 — Literature discovery (per accepted angle)
// ─────────────────────────────────────────────

/**
 * Stage 3: for each accepted angle, run OpenAlex discovery.
 * Queries are built from the angle text — deterministic, no LLM guessing.
 */
export async function stageLiteratureDiscover(
  run: OrchestratorRun,
  options: { maxResultsPerAngle?: number } = {},
): Promise<OrchestratorRun> {
  if (!run.scamper_session?.accepted) {
    run.stages.literature_discover = "blocked";
    run.errors.push("SCAMPER review not completed — cannot discover literature");
    return run;
  }

  run.stages.literature_discover = "running";
  const accepted = run.scamper_session.angles.filter((a) =>
    run.scamper_session!.accepted!.includes(a.lens),
  );

  const matrices: EvidenceMatrix[] = [];
  for (const angle of accepted) {
    // Build query from the angle — grounded in the validated text
    const query = `${run.idea} ${angle.angle}`.slice(0, 200);
    try {
      const matrix = await runLiteratureDiscovery(query, {
        maxResults: options.maxResultsPerAngle ?? 5,
      });
      matrices.push(matrix);
    } catch (e: any) {
      run.errors.push(`Literature discovery for lens ${angle.lens}: ${e.message}`);
    }
  }

  run.evidence_matrices = matrices;
  run.stages.literature_discover = matrices.length > 0 ? "done" : "failed";
  return run;
}

// ─────────────────────────────────────────────
// Stage 4 — Build pipeline brief for PaperOrchestra
// ─────────────────────────────────────────────

/**
 * Stage 4: assemble the structured brief that feeds the writing pipeline.
 * Contains only validated angles + verified evidence. Nothing raw.
 */
export function stageBuildPipelineBrief(run: OrchestratorRun): OrchestratorRun {
  if (run.stages.scamper_review !== "done") {
    run.stages.pipeline_input = "blocked";
    run.errors.push("Human review incomplete — brief not built");
    return run;
  }
  if (run.stages.literature_discover !== "done") {
    run.stages.pipeline_input = "blocked";
    run.errors.push("Literature discovery incomplete — brief not built");
    return run;
  }

  const accepted = run.scamper_session!.angles.filter((a) =>
    run.scamper_session!.accepted!.includes(a.lens),
  );

  const brief: PipelineBrief = {
    idea: run.idea,
    validated_angles: accepted.map((a) => ({
      lens: a.lens,
      lens_name: a.lens_name,
      angle: a.angle,
    })),
    evidence: accepted.map((a, i) => {
      const matrix = run.evidence_matrices[i];
      return {
        lens: a.lens,
        query: matrix?.query ?? "",
        total_verified: matrix?.total_results ?? 0,
        top_citations: (matrix?.entries ?? []).slice(0, 3).map((e) => ({
          title: e.title,
          doi: e.doi,
          url: e.url,
          cited_by: e.cited_by,
        })),
      };
    }),
    generated_at: new Date().toISOString(),
    template_versions: { scamper: run.scamper_session!.template_version },
  };

  run.pipeline_brief = brief;
  run.stages.pipeline_input = "done";
  return run;
}

// ─────────────────────────────────────────────
// Full run (automated stages only; review is manual)
// ─────────────────────────────────────────────

/**
 * Runs stages 1 and prepares for the human gate.
 * Stages 3-4 require the human to call stageScamperReview first.
 */
export function runUntilHumanGate(
  idea: string,
  angles: { lens: LensLetter; angle: string; rationale: string }[],
): OrchestratorRun {
  let run = startRun(idea);
  stageScamperGenerate(run);
  run = stageScamperAssemble(run, angles);
  return run; // stops here — human must review
}
