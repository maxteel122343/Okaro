/**
 * Okaro — SCAMPER Skill (v0 minimal, versioned)
 *
 * Mirrors the literature-discovery pattern: structured input, deterministic
 * execution, typed output with provenance and human-validation checkpoint.
 *
 * Difference from literature: validation is human acceptance of a generated
 * angle, not source existence. Every SCAMPER output is a *candidate*,
 * never a claim.
 *
 * Templates live in: hardware-and-innovation/lateral-thinking/skills/scamper/
 * This module is the executable contract around them.
 */

// ─────────────────────────────────────────────
// The seven lenses (fixed, versioned)
// ─────────────────────────────────────────────

export const SCAMPER_LENSES = [
  {
    letter: "S",
    name: "Substitute",
    prompt: "What can be replaced, swapped, or exchanged in this idea?",
    focus: "components, materials, people, rules, steps",
  },
  {
    letter: "C",
    name: "Combine",
    prompt: "What can be merged, mixed, or bundled together?",
    focus: "features, audiences, functions, markets",
  },
  {
    letter: "A",
    name: "Adapt",
    prompt: "What existing idea, elsewhere, could be borrowed or adjusted?",
    focus: "analogies, other domains, prior art",
  },
  {
    letter: "M",
    name: "Modify / Magnify / Minify",
    prompt: "What changes if you scale up, scale down, or distort an attribute?",
    focus: "size, frequency, intensity, cost, speed",
  },
  {
    letter: "P",
    name: "Put to another use",
    prompt: "Who else could use this, or what else could it become?",
    focus: "secondary markets, repurposing, adjacent problems",
  },
  {
    letter: "E",
    name: "Eliminate",
    prompt: "What happens if you remove a part, constraint, or assumption?",
    focus: "waste, complexity, hidden requirements",
  },
  {
    letter: "R",
    name: "Reverse / Rearrange",
    prompt: "What if you flip the order, the roles, or the direction?",
    focus: "sequence, hierarchy, causality, perspective",
  },
] as const;

export type LensLetter = (typeof SCAMPER_LENSES)[number]["letter"];

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ScamperAngle {
  lens: LensLetter;
  lens_name: string;
  angle: string;            // the generated idea/angle
  rationale: string;        // why it follows from the lens
  confidence: "raw";       // always raw until human review
}

export interface ScamperSession {
  id: string;
  idea: string;             // the seed idea being explored
  angles: ScamperAngle[];   // one per lens (7)
  template_version: string; // which SCAMPER template pack was used
  generated_at: string;
  status: "pending_human_review";
  reviewed_at: string | null;
  accepted: LensLetter[] | null; // filled only after human review
}

export const TEMPLATE_VERSION = "scamper-v1"; // bump when templates change

// ─────────────────────────────────────────────
// Generation (deterministic structure, LLM-fillable content)
// ─────────────────────────────────────────────

/**
 * Build the 7 lens prompts for a given seed idea.
 * The actual angle generation is delegated to whatever LLM/agent
 * calls this — this module guarantees the *structure* and the
 * *validation contract*, not the creativity.
 */
export function buildScamperPrompts(idea: string): {
  lens: LensLetter;
  lens_name: string;
  prompt: string;
}[] {
  return SCAMPER_LENSES.map((l) => ({
    lens: l.letter,
    lens_name: l.name,
    prompt: `${l.prompt}\n\nSeed idea: "${idea}"\nFocus areas: ${l.focus}\n\nReturn ONE concrete angle (1-3 sentences) and a one-line rationale. No lists, no filler.",
  }));
}

/**
 * Assemble a session from generated angles.
 * Enforces: exactly 7 angles, one per lens, all marked raw/unverified.
 */
export function assembleSession(
  idea: string,
  angles: { lens: LensLetter; angle: string; rationale: string }[],
): ScamperSession {
  if (angles.length !== 7) {
    throw new Error(`SCAMPER requires exactly 7 angles, got ${angles.length}`);
  }
  const seen = new Set(angles.map((a) => a.lens));
  if (seen.size !== 7) {
    throw new Error("Each SCAMPER lens must appear exactly once");
  }

  const now = new Date().toISOString();
  const id = `scamper-${Date.now()}`;

  return {
    id,
    idea,
    angles: angles.map((a) => {
      const def = SCAMPER_LENSES.find((l) => l.letter === a.lens)!;
      return {
        lens: a.lens,
        lens_name: def.name,
        angle: a.angle,
        rationale: a.rationale,
        confidence: "raw" as const,
      };
    }),
    template_version: TEMPLATE_VERSION,
    generated_at: now,
    status: "pending_human_review",
    reviewed_at: null,
    accepted: null,
  };
}

// ─────────────────────────────────────────────
// Human validation checkpoint
// ─────────────────────────────────────────────

/**
 * Mark lenses as accepted after human review.
 * This is the ONLY path from raw → validated.
 * No automated step can set accepted.
 */
export function reviewSession(
  session: ScamperSession,
  accepted: LensLetter[],
): ScamperSession {
  if (session.status !== "pending_human_review") {
    throw new Error("Session already reviewed");
  }
  const valid = new Set(SCAMPER_LENSES.map((l) => l.letter));
  for (const l of accepted) {
    if (!valid.has(l)) throw new Error(`Unknown lens: ${l}`);
  }
  return {
    ...session,
    status: "pending_human_review", // stays until explicitly closed
    reviewed_at: new Date().toISOString(),
    accepted,
    angles: session.angles.map((a) => ({
      ...a,
      confidence: accepted.includes(a.lens) ? ("raw" as const) : a.confidence,
    })),
  };
}

/**
 * Close the session: only accepted angles survive as validated assets.
 */
export function closeSession(session: ScamperSession): {
  session_id: string;
  idea: string;
  validated_angles: ScamperAngle[];
  discarded: number;
  template_version: string;
  closed_at: string;
} {
  if (!session.accepted) throw new Error("No review recorded — cannot close");
  const acceptedSet = new Set(session.accepted);
  const validated = session.angles.filter((a) => acceptedSet.has(a.lens));
  return {
    session_id: session.id,
    idea: session.idea,
    validated_angles: validated,
    discarded: session.angles.length - validated.length,
    template_version: session.template_version,
    closed_at: new Date().toISOString(),
  };
}
