/**
 * Bridge to external CadQuery skills now vendored in Okaro.
 * The actual SKILL.md files live under server/skills/external/
 * and can be loaded by any LLM agent that supports the Agent Skills format.
 */

export const externalCadSkills = {
  flowful: "server/skills/external/cad-skill",
  llmGuide: "server/skills/external/cadquery-llm-skill",
};

export function getCadSkillPath(id: "flowful" | "llmGuide"): string {
  return externalCadSkills[id];
}
