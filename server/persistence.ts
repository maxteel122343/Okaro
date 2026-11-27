/**
 * Camada de persistência para runs e estado do Okaro.
 *
 * Usa Cloudflare D1 via API REST quando as credenciais estão configuradas.
 * Em desenvolvimento local (sem credenciais) faz fallback para um arquivo JSON
 * em disco, garantindo que o estado sobreviva a reinícios do processo.
 */

import fs from "node:fs";
import path from "node:path";
import type { RunState } from "./pipeline.ts";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DATABASE_ID = process.env.D1_DATABASE_ID;

const useD1 = Boolean(ACCOUNT_ID && API_TOKEN && DATABASE_ID);

const FALLBACK_FILE = path.join(process.cwd(), "data", "runs-store.json");

function ensureFallbackDir() {
  const dir = path.dirname(FALLBACK_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadFallback(): Map<string, RunState> {
  ensureFallbackDir();
  if (!fs.existsSync(FALLBACK_FILE)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(FALLBACK_FILE, "utf-8"));
    return new Map(Object.entries(raw));
  } catch {
    return new Map();
  }
}

function saveFallback(store: Map<string, RunState>) {
  ensureFallbackDir();
  const obj = Object.fromEntries(store);
  fs.writeFileSync(FALLBACK_FILE, JSON.stringify(obj, null, 2), "utf-8");
}

async function d1Query(sql: string, params: unknown[] = []): Promise<any> {
  if (!useD1) throw new Error("D1 credentials not configured");

  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 query failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json.result?.[0] ?? json;
}

export async function saveRun(state: RunState): Promise<void> {
  if (useD1) {
    await d1Query(
      `INSERT INTO runs (
        id, idea, log, email, selected_model, selected_template, enable_plotting,
        current_step, running, failed, error_message, run_directory,
        figures_json, logs_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        current_step = excluded.current_step,
        running = excluded.running,
        failed = excluded.failed,
        error_message = excluded.error_message,
        figures_json = excluded.figures_json,
        logs_json = excluded.logs_json,
        updated_at = excluded.updated_at`,
      [
        state.id,
        state.idea,
        state.log,
        "", // email não está no RunState atualmente; pode ser estendido
        state.selectedModel,
        state.selectedTemplate,
        state.enablePlotting ? 1 : 0,
        state.currentStep,
        state.running ? 1 : 0,
        state.failed ? 1 : 0,
        state.errorMessage,
        state.runDirectory,
        JSON.stringify(state.figures),
        JSON.stringify(state.logs),
        state.createdAt,
        new Date().toISOString(),
      ]
    );
  } else {
    const store = loadFallback();
    store.set(state.id, state);
    saveFallback(store);
  }
}

export async function getRun(id: string): Promise<RunState | null> {
  if (useD1) {
    const result = await d1Query(`SELECT * FROM runs WHERE id = ?`, [id]);
    const row = result.results?.[0];
    if (!row) return null;
    return rowToRunState(row);
  } else {
    const store = loadFallback();
    return store.get(id) ?? null;
  }
}

export async function listRuns(): Promise<RunState[]> {
  if (useD1) {
    const result = await d1Query(
      `SELECT * FROM runs ORDER BY created_at DESC LIMIT 100`
    );
    return (result.results ?? []).map(rowToRunState);
  } else {
    const store = loadFallback();
    return Array.from(store.values()).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    );
  }
}

function rowToRunState(row: any): RunState {
  return {
    id: row.id,
    running: Boolean(row.running),
    currentStep: row.current_step,
    failed: Boolean(row.failed),
    errorMessage: row.error_message ?? "",
    runDirectory: row.run_directory,
    selectedModel: row.selected_model,
    selectedTemplate: row.selected_template,
    enablePlotting: Boolean(row.enable_plotting),
    idea: row.idea,
    log: row.log,
    figures: row.figures_json ? JSON.parse(row.figures_json) : [],
    logs: row.logs_json
      ? JSON.parse(row.logs_json)
      : {
          "Outline Generation": "",
          "Literature Review": "",
          "Figure Plotting": "",
          "Section Writing": "",
          "Content Refinement": "",
        },
    createdAt: row.created_at,
  };
}

export function isD1Enabled(): boolean {
  return useD1;
}
