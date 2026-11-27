/**
 * Graduated scoring (0-5) replacing binary accept/reject.
 * Dimensions: clarity, hardware feasibility, data potential, novelty vs literature.
 * Human gate becomes fast calibration, not binary judgment.
 * Merge weights angles by average score across framings.
 */

export interface ScoreDimensions {
  clarity: number;        // 0-5: how well-defined the angle is
  hardwareFeasibility: number; // 0-5: can it be prototyped with 3D print / off-the-shelf
  dataPotential: number;  // 0-5: does it generate trainable biomarker data
  novelty: number;        // 0-5: distance from existing literature
}

export interface ScoredAngle {
  lens: string;
  angle: string;
  rationale: string;
  scores: ScoreDimensions;
  averageScore: number;
  framing: string;
  status: "raw" | "scored" | "human_calibrated";
}

const WEIGHTS = {
  clarity: 0.25,
  hardwareFeasibility: 0.30,
  dataPotential: 0.25,
  novelty: 0.20,
} as const;

export function scoreAngle(
  lens: string,
  angle: string,
  rationale: string,
  framing: string,
  scores: ScoreDimensions
): ScoredAngle {
  const clamped = Object.fromEntries(
    Object.entries(scores).map(([k, v]) => [k, Math.max(0, Math.min(5, v))])
  ) as ScoreDimensions;

  const averageScore = Object.entries(WEIGHTS).reduce(
    (sum, [dim, w]) => sum + clamped[dim as unknown as string] * w,
    0
  );

  return {
    lens,
    angle,
    rationale,
    scores: clamped,
    averageScore: Math.round(averageScore * 100) / 100,
    framing,
    status: "scored",
  };
}

export function mergeScoredAngles(all: ScoredAngle[]): ScoredAngle[] {
  const seen = new Map<string, ScoredAngle>();
  for (const a of all) {
    const key = `${a.lens}::${a.angle.toLowerCase().replace(/\s+/g, " ")}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, a);
      continue;
    }
    // same angle from multiple framings: keep higher average, merge rationale
    if (a.averageScore > existing.averageScore) {
      seen.set(key, {
        ...a,
        rationale: `${existing.rationale} | also: ${a.rationale}`,
        framing: `${existing.framing}+${a.framing}`,
      });
    } else {
      existing.rationale += ` | also: ${a.rationale}`;
      existing.framing += `+${a.framing}`;
    }
  }
  return [...seen.values()].sort((a, b) => b.averageScore - a.averageScore);
}

export function topN(angles: ScoredAngle[], n: number): ScoredAngle[] {
  return angles.slice(0, n);
}
