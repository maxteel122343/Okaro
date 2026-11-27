/**
 * Okaro Skill Registry
 * 
 * Declares every skill with a typed manifest so the framework can
 * discover, select and compose them dynamically instead of hardcoding
 * a single pipeline.
 */

export type SkillManifest = {
  id: string;
  name: string;
  description: string;
  version: string;
  inputSchema: Record<string, string>;   // simple type hints
  outputSchema: Record<string, string>;
  tags: string[];                         // for intent matching
  dependencies?: string[];                // other skill ids
  offlineCapable: boolean;
};

const registry: SkillManifest[] = [
  {
    id: "scamper",
    name: "SCAMPER Idea Expansion",
    description: "Expands a raw idea into 7 structured angles (Substitute, Combine, Adapt, Modify, Put to another use, Eliminate, Reverse) with human review gate.",
    version: "1.0.0",
    inputSchema: { idea: "string" },
    outputSchema: { session: "ScamperSession" },
    tags: ["ideation", "creativity", "scamper", "brainstorm"],
    offlineCapable: true,
  },
  {
    id: "parallel-scamper",
    name: "Parallel SCAMPER",
    description: "Runs multiple framings of the same idea in parallel and merges unique angles.",
    version: "1.0.0",
    inputSchema: { idea: "string", framings: "string[]" },
    outputSchema: { mergedSession: "ScamperSession" },
    tags: ["ideation", "parallel", "scamper"],
    dependencies: ["scamper"],
    offlineCapable: true,
  },
  {
    id: "literature-discovery",
    name: "Literature Discovery",
    description: "Searches OpenAlex (and stubs for Crossref/PubMed) for real papers with DOI, URL and abstract.",
    version: "1.0.0",
    inputSchema: { query: "string" },
    outputSchema: { evidence: "EvidenceItem[]" },
    tags: ["research", "literature", "evidence", "openalex", "academic"],
    offlineCapable: false,
  },
  {
    id: "biomarker-capture",
    name: "Biomarker Capture",
    description: "Normalizes signals from conductive ink, RF or camera into a versioned dataset with provenance and quarantine.",
    version: "1.0.0",
    inputSchema: { source: "string", stream: "RawSample[]" },
    outputSchema: { dataset: "DatasetChunk" },
    tags: ["hardware", "sensor", "biomarker", "data", "health", "robotics"],
    offlineCapable: true,
  },
  {
    id: "minimal-viable-artifact",
    name: "Minimal Viable Artifact",
    description: "Generates a one-page card (problem, approach, key DOIs, next prototype step) for an accepted angle.",
    version: "1.0.0",
    inputSchema: { angle: "ScamperAngle", evidence: "EvidenceItem[]" },
    outputSchema: { card: "ArtifactCard" },
    tags: ["artifact", "output", "card", "summary"],
    offlineCapable: true,
  },
];

export function listSkills(): SkillManifest[] {
  return [...registry];
}

export function getSkill(id: string): SkillManifest | undefined {
  return registry.find(s => s.id === id);
}

export function findSkillsByTags(tags: string[]): SkillManifest[] {
  const set = new Set(tags.map(t => t.toLowerCase()));
  return registry.filter(s => s.tags.some(t => set.has(t.toLowerCase())));
}

export function registerSkill(manifest: SkillManifest) {
  const existing = registry.findIndex(s => s.id === manifest.id);
  if (existing >= 0) registry[existing] = manifest;
  else registry.push(manifest);
}
