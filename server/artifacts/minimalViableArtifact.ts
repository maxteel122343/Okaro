/**
 * Minimum viable artifact per accepted angle: one-page card.
 * Full paper only for top-N scored angles per cycle.
 * Card = problem, approach, key evidence (DOI), next prototype step.
 */

import type { ScoredAngle } from "../scoring/graduatedScoring";

export interface EvidenceRef {
  doi: string;
  url: string;
  title: string;
  source: "openalex" | "crossref" | "pubmed";
}

export interface ArtifactCard {
  id: string;
  lens: string;
  title: string;
  problem: string;
  approach: string;
  keyEvidence: EvidenceRef[];
  nextPrototypeStep: string;
  score: number;
  framing: string;
  generatedAt: string;
  status: "card" | "promoted_to_paper";
}

export function buildCard(
  angle: ScoredAngle,
  evidence: EvidenceRef[],
  nextStep: string
): ArtifactCard {
  return {
    id: `card-${angle.lens}-${Date.now()}`,
    lens: angle.lens,
    title: angle.angle.slice(0, 120),
    problem: angle.rationale,
    approach: angle.angle,
    keyEvidence: evidence.slice(0, 3), // top 3 DOIs only
    nextPrototypeStep: nextStep,
    score: angle.averageScore,
    framing: angle.framing,
    generatedAt: new Date().toISOString(),
    status: "card",
  };
}

export function promoteToPaper(card: ArtifactCard): ArtifactCard {
  return { ...card, status: "promoted_to_paper" };
}

export function selectPromotions(
  cards: ArtifactCard[],
  topN: number
): { promoted: ArtifactCard[]; cards: ArtifactCard[] } {
  const sorted = [...cards].sort((a, b) => b.score - a.score);
  const promoted = sorted.slice(0, topN).map(promoteToPaper);
  const rest = sorted.slice(topN);
  return { promoted, cards: rest };
}
