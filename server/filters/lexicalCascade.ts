/**
 * Cheap lexical pre-filter before expensive API calls.
 * Eliminates obviously off-domain angles without touching OpenAlex/Crossref/PubMed.
 * Anchor terms are domain-specific; extend per project.
 */

export const DEFAULT_ANCHORS = [
  "sensor", "biomarcador", "frequência", "captura", "hardware",
  "impressão 3d", "eletrodo", "rfid", "campo", "saúde", "movimento",
  "robô", "dados", "calibração", "tinta condutiva", "anten", "biofeedback",
];

export interface FilterResult {
  passed: boolean;
  matchedAnchors: string[];
  reason: string;
}

export function lexicalFilter(
  text: string,
  anchors: string[] = DEFAULT_ANCHORS,
  minMatches = 1
): FilterResult {
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const matched = anchors.filter((a) =>
    lower.includes(a.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
  );
  const passed = matched.length >= minMatches;
  return {
    passed,
    matchedAnchors: matched,
    reason: passed
      ? `matched ${matched.length} anchor(s): ${matched.join(", ")}`
      : `no domain anchors found (needed >= ${minMatches})`,
  };
}

export function filterAngles<T extends { angle: string; rationale: string }>(
  angles: T[],
  anchors: string[] = DEFAULT_ANCHORS,
  minMatches = 1
): { passed: T[]; rejected: { item: T; result: FilterResult }[] } {
  const passed: T[] = [];
  const rejected: { item: T; result: FilterResult }[] = [];
  for (const a of angles) {
    const combined = `${a.angle} ${a.rationale}`;
    const result = lexicalFilter(combined, anchors, minMatches);
    if (result.passed) passed.push(a);
    else rejected.push({ item: a, result });
  }
  return { passed, rejected };
}
