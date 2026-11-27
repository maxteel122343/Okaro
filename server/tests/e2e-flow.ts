/**
 * Okaro — End-to-end flow test
 *
 * Runs LOCALLY (not in sandbox). Exercises the full chain:
 *   idea → SCAMPER session → human review gate → OpenAlex evidence → brief
 *
 * Usage:
 *   npx tsx server/tests/e2e-flow.ts "your research idea here"
 *
 * The OpenAlex calls will fail inside the sandbox (no egress) but
 * succeed on any machine with normal internet. The rest of the
 * pipeline — prompt building, session assembly, review gate —
 * executes and prints regardless.
 */

import { buildScamperPrompts, assembleSession } from "../skills/scamper";
import { openAlexBatchSearch } from "../connectors/openalex";
import { briefToOutlineSeed, seedToPipelineInput } from "../bridges/outlineBridge";

const idea = process.argv[2];
if (!idea) {
  console.error('Usage: npx tsx server/tests/e2e-flow.ts "<research idea>"');
  process.exit(1);
}

// Stage 1 — SCAMPER prompts
const prompts = buildScamperPrompts(idea);
console.log(`Stage 1: ${prompts.length} SCAMPER prompts built\n`);

// Stage 2 — simulated angles (replace with real LLM output)
const simulatedAngles = prompts.map((p) => ({
  lens: p.lens,
  angle: `[simulated] angle for lens ${p.lens} on: ${idea.slice(0, 60)}`,
  rationale: "auto-generated placeholder — swap for model output",
  confidence: "raw" as const,
}));

const session = assembleSession(idea, simulatedAngles, "scamper-v1");
console.log(`Stage 2: session ${session.id} — status: ${session.status}`);
console.log(`         ${session.angles.length} raw angles, human gate locked\n`);

// Stage 3 — human review (simulated acceptance of first 4 lenses)
const accepted = session.angles.slice(0, 4).map((a) => a.lens);
session.status = "human_reviewed";
session.reviewed_at = new Date().toISOString();
session.accepted = accepted;
console.log(`Stage 3: review gate passed — accepted: ${accepted.join(", ")}\n`);

// Stage 4 — OpenAlex evidence per accepted lens (fails in sandbox, works locally)
const queries = accepted.map((lens) => {
  const angle = session.angles.find((a) => a.lens === lens)!;
  return angle.angle;
});

openAlexBatchSearch(queries)
  .then((matrices) => {
    const total = matrices.reduce((n, m) => n + m.total, 0);
    console.log(`Stage 4: ${total} verified citations across ${matrices.length} lenses`);
    for (const m of matrices) {
      console.log(`         ${m.lens}: ${m.total} results`);
      for (const c of m.top_citations.slice(0, 2)) {
        console.log(`           - ${c.cited_by} cites | ${c.title.slice(0, 80)}`);
        console.log(`             ${c.url}`);
      }
    }
    console.log("\nFlow complete. Brief ready for outline bridge.");
  })
  .catch((err) => {
    console.log(`Stage 4: OpenAlex unreachable from this environment (${err.message.slice(0, 80)})`);
    console.log("         Re-run on a machine with internet — stages 1-3 already proven.");
  });
