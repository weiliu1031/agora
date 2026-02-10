import type Database from 'better-sqlite3';

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'registered',
      version TEXT,
      capabilities TEXT,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_heartbeat TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'created',
      total_tasks INTEGER DEFAULT 0,
      completed_tasks INTEGER DEFAULT 0,
      failed_tasks INTEGER DEFAULT 0,
      job_spec TEXT NOT NULL,
      git_repo_path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      task_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      task_spec TEXT NOT NULL,
      claimed_by TEXT REFERENCES agents(id),
      assigned_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      result TEXT,
      error_message TEXT,
      progress_percent INTEGER DEFAULT 0,
      timeout_seconds INTEGER NOT NULL DEFAULT 3600,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(job_id, task_index)
    );

    CREATE TABLE IF NOT EXISTS task_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      agent_id TEXT NOT NULL REFERENCES agents(id),
      progress_percent INTEGER NOT NULL,
      message TEXT,
      reported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      event_type TEXT NOT NULL,
      agent_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      event_type TEXT NOT NULL,
      agent_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      agent_id TEXT NOT NULL REFERENCES agents(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(job_id, agent_id)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_job_id ON tasks(job_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_claimed_by ON tasks(claimed_by);
    CREATE INDEX IF NOT EXISTS idx_task_progress_task_id ON task_progress(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_approvals_job_id ON job_approvals(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_approvals_agent_id ON job_approvals(agent_id);
  `);

  // Add columns to jobs table (safe with IF NOT EXISTS pattern via try/catch)
  const alterStatements = [
    "ALTER TABLE jobs ADD COLUMN approval_count INTEGER DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN required_approvals INTEGER DEFAULT 5",
  ];
  for (const sql of alterStatements) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
}
