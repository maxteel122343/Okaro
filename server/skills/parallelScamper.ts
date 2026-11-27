/**
 * Okaro — Parallel SCAMPER Runner
 *
 * Runs N framings of the SAME idea simultaneously, each with a different
 * contextual lens (hardware-first, no-hardware, environment-first,
 * data-first, cost-first). Merges all angle pools into one session
 * so the human reviews once across all framings.
 *
 * Usage:
 *   npx tsx server/skills/parallelScamper.ts "your idea"
 */

import { buildScamperPrompts, assembleSession, type ScamperSession, type ScamperAngle } from "./scamper";

export type Framing = {
  id: string;
  name: string;
  context: string; // injected into the idea before SCAMPER runs
  weight: number;  // priority for merge conflicts (higher = preferred)
};

/** Default framings for a hardware/biomarker idea. Swap freely. */
export const DEFAULT_FRAMINGS: Framing[] = [
  {
    id: "hardware-first",
    name: "Hardware-first",
    context: "Prioritize physical device construction (3D printed, off-the-shelf parts, minimal electronics).",
    weight: 1.0,
  },
  {
    id: "no-hardware",
    name: "No-hardware / passive",
    context: "Prioritize solutions that require NO dedicated device — ambient surfaces, existing objects, passive tags.",
    weight: 1.0,
  },
  {
    id: "environment-first",
    name: "Environment-first",
    context: "Prioritize the surrounding space (room, furniture, walls) as the sensing medium rather than anything worn.",
    weight: 0.9,
  },
  {
    id: "data-first",
    name: "Data-first",
    context: "Prioritize data quality and volume for AI/robotics training over sensing elegance.",
    weight: 0.9,
  },
  {
    id: "cost-first",
    name: "Cost-first",
    context: "Prioritize sub-$20 build cost and mass-manufacturability.",
    weight: 0.8,
  },
];

export type FramingResult = {
  framing: Framing;
  session: ScamperSession;
  error?: string;
};

/**
 * Run SCAMPER across all framings in parallel (Promise.all).
 * Each framing gets its own session with the context injected.
 */
export async function runParallelScamper(
  idea: string,
  framings: Framing[] = DEFAULT_FRAMINGS,
  angleGenerator?: (framing: Framing, prompts: ReturnType<typeof buildScamperPrompts>) => Promise<ScamperAngle[]>
): Promise<FramingResult[]> {
  const tasks = framings.map(async (framing): Promise<FramingResult> => {
    try {
      const framedIdea = `[${framing.name}] ${framing.context}\n\nOriginal idea: ${idea}`;
      const prompts = buildScamperPrompts(framedIdea);

      // If a generator is provided (real LLM), use it; otherwise simulate.
      const angles: ScamperAngle[] = angleGenerator
        ? await angleGenerator(framing, prompts)
        : prompts.map((p) => ({
            lens: p.lens,
            angle: `[${framing.id}] simulated angle for ${p.lens}`,
            rationale: `framing: ${framing.name}`,
            confidence: "raw" as const,
          }));

      const session = assembleSession(framedIdea, angles, "scamper-v1");
      return { framing, session };
    } catch (err: any) {
      return { framing, session: null as any, error: err.message };
    }
  });

  return Promise.all(tasks);
}

/**
 * Merge angle pools from parallel framings into ONE reviewable session.
 * Dedupes by lens+angle similarity (simple normalized string match).
 * Higher-weight framings win conflicts; all sources are preserved in provenance.
 */
export function mergeAnglePools(results: FramingResult[]): ScamperSession {
  const seen = new Map<string, ScamperAngle & { sources: string[] }>();

  for (const r of results) {
    if (r.error || !r.session) continue;
    for (const angle of r.session.angles) {
      const key = `${angle.lens}::${normalize(angle.angle)}`;
      const existing = seen.get(key);
      if (existing) {
        existing.sources.push(r.framing.id);
        // keep higher-weight framing's text
        const wNew = r.framing.weight;
        const wOld = results.find((x) => x.framing.id === existing.sources[0])?.framing.weight ?? 0;
        if (wNew > wOld) {
          existing.angle = angle.angle;
          existing.rationale = angle.rationale;
        }
      } else {
        seen.set(key, { ...angle, sources: [r.framing.id] });
      }
    }
  }

  const merged: ScamperAngle[] = Array.from(seen.values()).map(
    ({ sources, ...a }) => ({ ...a, rationale: `${a.rationale} [sources: ${sources.join(", ")}]` })
  );

  const baseIdea = results[0]?.session?.idea?.replace(/^\[[^\]]+\][^\n]*\n\nOriginal idea: /, "") ?? "";
  return assembleSession(baseIdea, merged, "scamper-v1-parallel");
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

// ── CLI smoke test ──────────────────────────────────────────────
if (require.main === module) {
  const idea = process.argv[2] ?? "Hardware impresso em 3D para captação de biomarcadores com IA assistida";
  runParallelScamper(idea).then((results) => {
    const ok = results.filter((r) => !r.error).length;
    console.log(`Parallel SCAMPER: ${ok}/${results.length} framings succeeded`);
    for (const r of results) {
      console.log(`  ${r.framing.id}: ${r.session?.angles.length ?? 0} angles${r.error ? " ERROR: " + r.error : ""}`);
    }
    const merged = mergeAnglePools(results);
    console.log(`\nMerged session: ${merged.id}`);
    console.log(`  ${merged.angles.length} unique angles across all framings`);
    console.log(`  status: ${merged.status} — human gate locked, awaiting review`);
  });
}
