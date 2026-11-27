import { GoogleGenAI, type Content, type Part } from "@google/genai";

let cachedClient: GoogleGenAI | null = null;

export function getGenAIClient(): GoogleGenAI {
  if (!cachedClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    const vertexProject = process.env.VERTEX_AI_PROJECT;
    const vertexLocation = process.env.VERTEX_AI_LOCATION;

    if (vertexProject && vertexLocation) {
      cachedClient = new GoogleGenAI({
        vertexai: true,
        project: vertexProject,
        location: vertexLocation,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } else if (apiKey) {
      cachedClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } else {
      throw new Error(
        "GEMINI_API_KEY (or VERTEX_AI_PROJECT & VERTEX_AI_LOCATION) is not configured in environment variables."
      );
    }
  }
  return cachedClient;
}

export function parseGeminiJsonResults(response: string): any {
  if (!response || typeof response !== "string") return null;

  const fencedMatches = [...response.matchAll(/```json\s*([\s\S]*?)```/gi)].map(
    (m) => m[1]
  );

  const candidates =
    fencedMatches.length > 0
      ? fencedMatches
      : (() => {
          const braceStart = response.indexOf("{");
          const braceEnd = response.lastIndexOf("}");
          const bracketStart = response.indexOf("[");
          const bracketEnd = response.lastIndexOf("]");
          const list: string[] = [];
          if (braceStart !== -1 && braceEnd > braceStart) {
            list.push(response.slice(braceStart, braceEnd + 1));
          }
          if (bracketStart !== -1 && bracketEnd > bracketStart) {
            list.push(response.slice(bracketStart, bracketEnd + 1));
          }
          return list;
        })();

  for (const raw of candidates) {
    const trimmed = raw.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      try {
        const cleaned = trimmed
          .replace(/[\x00-\x1F\x7F]/g, (ch) =>
            ch === "\n" || ch === "\r" || ch === "\t" ? " " : ""
          )
          .replace(/,\s*([\]}])/g, "$1")
          .replace(/\\(?![\\"/bfnrtu])/g, "\\\\");
        return JSON.parse(cleaned);
      } catch {
        continue;
      }
    }
  }

  return null;
}

export function parseGeminiLatexResults(response: string): string {
  const match = response.trim().match(/```latex\s*([\s\S]*?)\s*```/i);
  if (match) return match[1].trim();
  const texMatch = response.trim().match(/```tex\s*([\s\S]*?)\s*```/i);
  if (texMatch) return texMatch[1].trim();
  return response.trim();
}

export function parseGeminiJsonLatexResponse(responseText: string): {
  json: Record<string, any> | null;
  latex: string | null;
} {
  const result: { json: Record<string, any> | null; latex: string | null } = {
    json: null,
    latex: null,
  };

  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) {
    result.json = parseGeminiJsonResults(jsonMatch[0]) ?? {
      error: "Invalid JSON format returned",
    };
  }

  const latexMatch = responseText.match(/```latex\s*([\s\S]*?)\s*```/i);
  if (latexMatch) {
    result.latex = latexMatch[1].trim();
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CallGeminiOptions<T = any> {
  contents: string | Content | Part[] | Array<string | Part>;
  modelName: string;
  systemInstruction?: string;
  temperature?: number;
  tools?: any[];
  maxRetries?: number;
  baseIntervalMs?: number;
  parser?: (raw: string) => T;
  requireParsed?: boolean;
}

export async function callGeminiWithRetry<T = any>({
  contents,
  modelName,
  systemInstruction,
  temperature,
  tools,
  maxRetries = 4,
  baseIntervalMs = 4000,
  parser = (raw) => parseGeminiJsonResults(raw) as T,
  requireParsed = true,
}: CallGeminiOptions<T>): Promise<{ rawResponse: string; parsedResponse: T }> {
  const ai = getGenAIClient();

  const normalizedContents: any = Array.isArray(contents)
    ? contents.map((item) =>
        typeof item === "string" ? { text: item } : item
      )
    : contents;

  const config: Record<string, any> = {};
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }
  if (
    typeof temperature === "number" &&
    !modelName.startsWith("gemini-4-")
  ) {
    config.temperature = temperature;
  }
  if (tools && tools.length > 0) {
    config.tools = tools;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: normalizedContents,
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      const rawResponse = response.text ?? "";
      if (!rawResponse) {
        throw new Error("Empty response text from Gemini API");
      }

      const parsedResponse = parser(rawResponse);
      if (requireParsed && (parsedResponse === null || parsedResponse === undefined)) {
        throw new Error(
          `Failed to parse structured response from model output (length=${rawResponse.length})`
        );
      }

      return { rawResponse, parsedResponse };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (
        lower.includes("400 invalid_argument") ||
        lower.includes("api_key_invalid") ||
        lower.includes("permission_denied") ||
        lower.includes("maximum number of tokens")
      ) {
        throw err;
      }
      if (attempt + 1 < maxRetries) {
        const delay = baseIntervalMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function generateImageWithGemini({
  modelName,
  prompt,
  systemInstruction,
  aspectRatio = "16:9",
  maxRetries = 2,
}: {
  modelName: string;
  prompt: string;
  systemInstruction?: string;
  aspectRatio?: string;
  maxRetries?: number;
}): Promise<string | null> {
  const ai = getGenAIClient();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts: [{ text: prompt }] },
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          imageConfig: {
            aspectRatio,
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          return part.inlineData.data;
        }
      }
    } catch (err) {
      if (attempt + 1 === maxRetries) {
        throw err;
      }
      await sleep(3000 * (attempt + 1));
    }
  }

  return null;
}
