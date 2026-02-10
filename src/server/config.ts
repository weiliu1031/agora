import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
  },

  database: {
    path: process.env.DB_PATH || path.join(PROJECT_ROOT, 'data', 'ajc.db'),
  },

  git: {
    reposDir: process.env.REPOS_DIR || path.join(PROJECT_ROOT, 'data', 'repos'),
  },

  task: {
    defaultTimeoutSeconds: parseInt(process.env.TASK_TIMEOUT || '3600', 10),
    defaultMaxRetries: parseInt(process.env.TASK_MAX_RETRIES || '3', 10),
  },

  scheduler: {
    timeoutCheckIntervalMs: 30_000,
    heartbeatCheckIntervalMs: 60_000,
    jobStatusCheckIntervalMs: 10_000,
    agentHeartbeatGraceSeconds: 120,
  },

  agent: {
    heartbeatIntervalMs: 30_000,
  },
};

export type Config = typeof config;
