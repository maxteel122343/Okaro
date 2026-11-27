-- Okaro / PaperOrchestra — schema D1
-- Aplicar com: wrangler d1 execute okaro --file=./db/schema.sql
-- ou via dashboard Cloudflare D1

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  idea TEXT NOT NULL,
  log TEXT NOT NULL,
  email TEXT,
  selected_model TEXT,
  selected_template TEXT,
  enable_plotting INTEGER DEFAULT 1,
  current_step INTEGER DEFAULT 0,
  running INTEGER DEFAULT 1,
  failed INTEGER DEFAULT 0,
  error_message TEXT,
  run_directory TEXT,
  figures_json TEXT,
  logs_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT,
  intention TEXT NOT NULL,
  domain TEXT,
  constraints TEXT,
  desired_outcome TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  idea_id TEXT,
  type TEXT NOT NULL,
  title TEXT,
  content TEXT,
  path TEXT,
  version INTEGER DEFAULT 1,
  parent_version TEXT,
  status TEXT DEFAULT 'generated',
  evidence_ids TEXT,
  skills TEXT,
  tools TEXT,
  provider TEXT,
  model TEXT,
  prompt_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at);
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
