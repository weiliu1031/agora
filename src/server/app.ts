import express from 'express';
import cors from 'cors';
import agentRoutes from './routes/agents.js';
import jobRoutes from './routes/jobs.js';
import taskRoutes from './routes/tasks.js';
import { AppError } from './utils/errors.js';
import { getDb } from './database/db.js';
import { logger } from './utils/logger.js';
import * as jobService from './services/job.service.js';
import * as taskService from './services/task.service.js';
import { getDashboardHtml } from './dashboard.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Dashboard UI
app.get('/', (_req, res) => {
  res.type('html').send(getDashboardHtml());
});

// Health & Stats
app.get('/api/health', (_req, res) => {
  const start = Date.now();
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    const dbTime = Date.now() - start;

    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: { connected: true, response_time_ms: dbTime },
      },
    });
  } catch {
    res.status(503).json({
      success: false,
      error: { code: 'UNHEALTHY', message: 'Service is unhealthy' },
    });
  }
});

app.get('/api/stats', (_req, res) => {
  try {
    const jobStats = jobService.getJobStats();
    const taskStats = taskService.getTaskStats();
    const db = getDb();
    const agentStats = db
      .prepare(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
          SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline
        FROM agents`
      )
      .get() as { total: number; online: number; offline: number };

    res.json({
      success: true,
      data: {
        agents: agentStats,
        jobs: jobStats,
        tasks: taskStats,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: 'Failed to fetch stats' },
    });
  }
});

// API Routes
app.use('/api/agents', agentRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/tasks', taskRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  });
});

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
    } else {
      logger.error('App', 'Unhandled error', err);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }
  }
);

export default app;
