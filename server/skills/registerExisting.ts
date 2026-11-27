/**
 * Registers the skills that already exist in the codebase
 * into the central registry so the intent router can discover them.
 */

import { registerSkill } from "./registry";

export function registerAllExistingSkills() {
  registerSkill({
    id: "scamper",
    name: "SCAMPER Idea Expansion",
    description: "Expands a raw idea into 7 structured angles with human review gate.",
    version: "1.0.0",
    inputSchema: { idea: "string" },
    outputSchema: { session: "ScamperSession" },
    tags: ["ideation", "creativity", "scamper", "brainstorm", "ideia"],
    offlineCapable: true,
  });

  registerSkill({
    id: "parallel-scamper",
    name: "Parallel SCAMPER",
    description: "Runs multiple framings of the same idea in parallel and merges unique angles.",
    version: "1.0.0",
    inputSchema: { idea: "string" },
    outputSchema: { mergedSession: "ScamperSession" },
    tags: ["ideation", "parallel", "scamper"],
    dependencies: ["scamper"],
    offlineCapable: true,
  });

  registerSkill({
    id: "literature-discovery",
    name: "Literature Discovery",
    description: "Searches OpenAlex for real papers with DOI, URL and abstract. Crossref/PubMed stubs ready.",
    version: "1.0.0",
    inputSchema: { query: "string" },
    outputSchema: { evidence: "EvidenceItem[]" },
    tags: ["research", "literature", "evidence", "openalex", "academic", "pesquisa", "artigo"],
    offlineCapable: false,
  });

  registerSkill({
    id: "biomarker-capture",
    name: "Biomarker Capture",
    description: "Normalizes signals from conductive ink, RF or camera into a versioned dataset with provenance.",
    version: "1.0.0",
    inputSchema: { source: "string", stream: "RawSample[]" },
    outputSchema: { dataset: "DatasetChunk" },
    tags: ["hardware", "sensor", "biomarker", "data", "health", "robotics", "captura"],
    offlineCapable: true,
  });

  registerSkill({
    id: "minimal-viable-artifact",
    name: "Minimal Viable Artifact",
    description: "Generates a one-page card for an accepted angle with key DOIs and next prototype step.",
    version: "1.0.0",
    inputSchema: { angle: "ScamperAngle", evidence: "EvidenceItem[]" },
    outputSchema: { card: "ArtifactCard" },
    tags: ["artifact", "output", "card", "summary", "prototipo"],
    offlineCapable: true,
  });

  registerSkill({
    id: "orchestrator-v2",
    name: "Full Cycle Orchestrator",
    description: "Runs the complete closed loop: parallel SCAMPER → lexical filter → scoring → human gate → multi-source evidence → artifacts → field data → metrics.",
    version: "2.0.0",
    inputSchema: { idea: "string" },
    outputSchema: { cycleResult: "CycleResult" },
    tags: ["orchestrator", "cycle", "full", "pipeline"],
    dependencies: ["parallel-scamper", "literature-discovery", "minimal-viable-artifact"],
    offlineCapable: false,
  });
}
