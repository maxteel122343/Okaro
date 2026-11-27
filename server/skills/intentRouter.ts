/**
 * Basic Intent Router
 * 
 * Takes a high-level goal in natural language and returns the most relevant
 * skills from the registry. Future versions can use a local LLM for better matching.
 */

import { findSkillsByTags, listSkills, type SkillManifest } from "./registry";

const keywordMap: Record<string, string[]> = {
  ideia: ["ideation", "scamper", "creativity"],
  idea: ["ideation", "scamper", "creativity"],
  scamper: ["scamper", "ideation"],
  pesquisa: ["research", "literature", "evidence"],
  research: ["research", "literature", "evidence"],
  paper: ["research", "literature", "artifact"],
  artigo: ["research", "literature", "artifact"],
  hardware: ["hardware", "sensor", "biomarker"],
  sensor: ["hardware", "sensor", "biomarker"],
  biomarcador: ["biomarker", "data", "health"],
  dados: ["data", "biomarker"],
  prototipo: ["hardware", "artifact"],
  cad: ["hardware"],
  teste: ["ideation", "research"],
};

export function routeIntent(goal: string): SkillManifest[] {
  const lower = goal.toLowerCase();
  const matchedTags = new Set<string>();

  for (const [kw, tags] of Object.entries(keywordMap)) {
    if (lower.includes(kw)) {
      tags.forEach(t => matchedTags.add(t));
    }
  }

  if (matchedTags.size === 0) {
    // fallback: return all offline-capable skills
    return listSkills().filter(s => s.offlineCapable);
  }

  return findSkillsByTags([...matchedTags]);
}

// CLI for quick testing
if (require.main === module) {
  const goal = process.argv.slice(2).join(" ") || "gerar ideias e pesquisar evidências sobre sensores de biomarcadores";
  const skills = routeIntent(goal);
  console.log(`Goal: ${goal}`);
  console.log("Selected skills:");
  skills.forEach(s => console.log(`- ${s.id}: ${s.name}`));
}
