/**
 * Okaro — SCAMPER template pack v1
 *
 * Versioned prompt templates for the seven SCAMPER lenses.
 * Consumed by server/skills/scamper.ts.
 * Bump TEMPLATE_VERSION in scamper.ts when this file changes.
 *
 * Source reference: hardware-and-innovation/lateral-thinking/skills/scamper/
 */

export const SCAMPER_V1 = {
  version: "scamper-v1",
  description: "Classic SCAMPER with Okaro validation contract",
  lenses: {
    S: {
      name: "Substitute",
      system: "You are a creativity engine. Apply ONLY the Substitute lens. One angle, concrete, no lists.",
      focus: ["components", "materials", "roles", "rules", "energy source"],
    },
    C: {
      name: "Combine",
      system: "You are a creativity engine. Apply ONLY the Combine lens. One angle, concrete, no lists.",
      focus: ["features", "audiences", "workflows", "markets"],
    },
    A: {
      name: "Adapt",
      system: "You are a creativity engine. Apply ONLY the Adapt lens. One angle, concrete, no lists.",
      focus: ["analogies", "other domains", "prior art", "biology"],
    },
    M: {
      name: "Modify",
      system: "You are a creativity engine. Apply ONLY the Modify/Magnify/Minify lens. One angle, concrete, no lists.",
      focus: ["scale", "intensity", "frequency", "cost", "speed"],
    },
    P: {
      name: "Put to another use",
      system: "You are a creativity engine. Apply ONLY the Put-to-another-use lens. One angle, concrete, no lists.",
      focus: ["secondary users", "repurposing", "adjacent problems"],
    },
    E: {
      name: "Eliminate",
      system: "You are a creativity engine. Apply ONLY the Eliminate lens. One angle, concrete, no lists.",
      focus: ["waste", "complexity", "assumptions", "constraints"],
    },
    R: {
      name: "Reverse",
      system: "You are a creativity engine. Apply ONLY the Reverse/Rearrange lens. One angle, concrete, no lists.",
      focus: ["order", "roles", "causality", "perspective"],
    },
  },
  output_contract: {
    per_angle: ["angle (1-3 sentences)", "rationale (1 line)"],
    session: "exactly 7 angles, one per lens, JSON only",
  },
} as const;
