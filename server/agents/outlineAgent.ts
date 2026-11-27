import fs from "node:fs";
import { callGeminiWithRetry, parseGeminiJsonResults } from "../gemini.ts";
import { buildOutlineSystemPrompt } from "../prompts.ts";

export interface OutlineAgentOptions {
  modelName: string;
  cutoffDate: string;
  ideaFile: string;
  experimentalLogFile: string;
  latexTemplateFile: string;
  conferenceGuidelinesFile: string;
  outputFilepath: string;
  onLog?: (msg: string) => void;
}

export async function runOutlineAgent(opts: OutlineAgentOptions): Promise<any> {
  const log = opts.onLog ?? (() => {});
  log(` > OutlineAgent starting with model ${opts.modelName}...\n`);

  const idea = fs.readFileSync(opts.ideaFile, "utf-8");
  const expLog = fs.readFileSync(opts.experimentalLogFile, "utf-8");
  const templateTex = fs.readFileSync(opts.latexTemplateFile, "utf-8");
  const guidelines = fs.readFileSync(opts.conferenceGuidelinesFile, "utf-8");

  const systemPrompt = buildOutlineSystemPrompt(opts.cutoffDate);

  const response = await callGeminiWithRetry({
    modelName: opts.modelName,
    contents: [
      { text: systemPrompt },
      { text: `'idea.md':\n${idea}` },
      { text: `'experimental_log.md':\n${expLog}` },
      { text: `'template.tex':\n${templateTex}` },
      { text: guidelines },
    ],
    parser: parseGeminiJsonResults,
    requireParsed: true,
  });

  const jsonResult = response.parsedResponse;
  fs.writeFileSync(
    opts.outputFilepath,
    JSON.stringify(jsonResult, null, 4),
    "utf-8"
  );
  log(`outline.json output written to ${opts.outputFilepath}\n`);
  return jsonResult;
}
