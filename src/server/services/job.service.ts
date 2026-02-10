import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/db.js';
import type { Job, JobStatus, CreateJobRequest } from '../models/types.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { config } from '../config.js';
import * as gitService from './git.service.js';
import * as jobEventsService from './job-events.service.js';

const SERVICE_NAME = 'JobService';

/**
 * Submits a new job in 'committed' status.
 * Does NOT create tasks — tasks are created later after approval + planning.
 */
export async function submitJob(req: CreateJobRequest): Promise<Job> {
  // Validation
  if (!req.name || req.name.trim().length === 0) {
    throw new ValidationError('Job name is required', { field: 'name' });
  }

  if (!req.job_spec || Object.keys(req.job_spec).length === 0) {
    throw new ValidationError('Job spec is required', { field: 'job_spec' });
  }

  const jobId = uuidv4();
  const repoPath = `${config.git.reposDir}/${jobId}`;
  const db = getDb();

  logger.info(SERVICE_NAME, `Submitting job ${jobId}`, { name: req.name });

  try {
    const jobSpec = {
      name: req.name,
      description: req.description,
      spec: req.job_spec,
      metadata: req.metadata,
    };

    const insertJobStmt = db.prepare(`
      INSERT INTO jobs (id, name, description, status, total_tasks, job_spec, git_repo_path, approval_count, required_approvals)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertJobStmt.run(
      jobId,
      req.name,
      req.description || null,
      'committed',
      0,
      JSON.stringify(jobSpec),
      repoPath,
      0,
      5
    );

    logger.debug(SERVICE_NAME, `Inserted job record for ${jobId}`);

    // Record submitted event
    jobEventsService.recordEvent(jobId, 'submitted', null, {
      name: req.name,
      description: req.description,
    });

    // Initialize git repo (fire and forget)
    gitService.initJobRepo(jobId, {
      id: jobId,
      name: req.name,
      description: req.description,
      status: 'committed',
      created_at: new Date().toISOString(),
    }).catch((err) => {
      logger.warn(SERVICE_NAME, `Failed to init git repo for ${jobId}`, err);
    });

    logger.info(SERVICE_NAME, `Job ${jobId} submitted successfully`, { name: req.name });

    return getJob(jobId);
  } catch (error) {
    logger.error(SERVICE_NAME, `Failed to submit job ${jobId}`, error);
    throw error;
  }
}

/**
 * Creates a plan task for an accepted job.
 * Called automatically when a job reaches 'accepted' status (5 approvals).
 * Transitions job: accepted → planning
 */
export function createPlanTask(jobId: string): void {
  const db = getDb();
  const job = getJob(jobId);

  if (job.status !== 'accepted') {
    logger.warn(SERVICE_NAME, `Cannot create plan task: job ${jobId} is in ${job.status} status`);
    return;
  }

  const taskId = `${jobId}_task_0`;
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    // Create the plan task at index 0
    const insertStmt = db.prepare(`
      INSERT INTO tasks (id, job_id, task_index, status, task_spec, timeout_seconds, max_retries, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      taskId,
      jobId,
      0, // Plan task is always index 0
      'pending',
      JSON.stringify({ type: 'plan', job_spec: job.job_spec }),
      config.task.defaultTimeoutSeconds,
      config.task.defaultMaxRetries,
      now
    );

    // Update job: total_tasks=1, status=planning
    db.prepare(`UPDATE jobs SET status = 'planning', total_tasks = 1 WHERE id = ?`).run(jobId);

    // Record events
    jobEventsService.recordEvent(jobId, 'plan_created', null, { task_id: taskId });

    // Insert task history
    db.prepare(`
      INSERT INTO task_history (task_id, event_type, details, created_at)
      VALUES (?, 'created', ?, ?)
    `).run(taskId, JSON.stringify({ type: 'plan' }), now);
  });

  try {
    transaction();
    logger.info(SERVICE_NAME, `Created plan task for job ${jobId}`);
  } catch (error) {
    logger.error(SERVICE_NAME, `Failed to create plan task for job ${jobId}`, error);
    throw error;
  }
}

/**
 * Handles the completion of a plan task.
 * Extracts task_specs from the plan result, creates actual tasks, transitions to 'ready'.
 */
export async function handlePlanCompletion(
  jobId: string,
  planResult: Record<string, unknown>
): Promise<void> {
  const db = getDb();

  // Extract task_specs from the plan result
  const taskSpecs = planResult.task_specs as Array<{
    specification: Record<string, unknown>;
    timeout_seconds?: number;
    max_retries?: number;
  }>;

  if (!taskSpecs || !Array.isArray(taskSpecs) || taskSpecs.length === 0) {
    logger.error(SERVICE_NAME, `Plan result for job ${jobId} has no task_specs`);
    // Mark the job as failed
    db.prepare(`UPDATE jobs SET status = 'failed', completed_at = datetime('now') WHERE id = ?`).run(jobId);
    jobEventsService.recordEvent(jobId, 'failed', null, { reason: 'Plan produced no task_specs' });
    return;
  }

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    // Create actual tasks (starting at index 1, since index 0 is the plan task)
    const insertStmt = db.prepare(`
      INSERT INTO tasks (id, job_id, task_index, status, task_spec, timeout_seconds, max_retries, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const gitTasks: Array<{ taskId: string; taskIndex: number; spec: Record<string, unknown> }> = [];

    for (let i = 0; i < taskSpecs.length; i++) {
      const spec = taskSpecs[i];
      const taskIndex = i + 1; // Start from 1
      const taskId = `${jobId}_task_${taskIndex}`;
      const timeoutSeconds = spec.timeout_seconds || config.task.defaultTimeoutSeconds;
      const maxRetries = spec.max_retries || config.task.defaultMaxRetries;

      insertStmt.run(
        taskId,
        jobId,
        taskIndex,
        'pending',
        JSON.stringify(spec.specification || spec),
        timeoutSeconds,
        maxRetries,
        now
      );

      gitTasks.push({
        taskId,
        taskIndex,
        spec: spec.specification || (spec as Record<string, unknown>),
      });
    }

    // Update job: total_tasks = actual task count (excluding plan task), status = ready
    db.prepare(`
      UPDATE jobs SET status = 'ready', total_tasks = ? WHERE id = ?
    `).run(taskSpecs.length, jobId);

    // Record events
    jobEventsService.recordEvent(jobId, 'plan_completed', null, {
      task_count: taskSpecs.length,
    });
    jobEventsService.recordEvent(jobId, 'tasks_created', null, {
      task_count: taskSpecs.length,
    });

    logger.info(SERVICE_NAME, `Created ${taskSpecs.length} tasks from plan for job ${jobId}`);

    return gitTasks;
  });

  try {
    const gitTasks = transaction();

    // Commit task specs to git (fire and forget)
    if (gitTasks) {
      gitService.commitTaskSpecs(jobId, gitTasks).catch((err) => {
        logger.warn(SERVICE_NAME, `Failed to commit task specs for ${jobId}`, err);
      });
      gitService.commitJobStatus(jobId, 'ready', `Job: Ready with ${gitTasks.length} task(s)`).catch((err) => {
        logger.warn(SERVICE_NAME, `Failed to commit job status for ${jobId}`, err);
      });
    }
  } catch (error) {
    logger.error(SERVICE_NAME, `Failed to handle plan completion for job ${jobId}`, error);
    throw error;
  }
}

/**
 * Retrieves a job by ID
 */
export function getJob(jobId: string): Job {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, name, description, status, total_tasks, completed_tasks,
           failed_tasks, job_spec, git_repo_path, created_at, started_at,
           completed_at, created_by, approval_count, required_approvals
    FROM jobs
    WHERE id = ?
  `);

  const row = stmt.get(jobId) as any;

  if (!row) {
    throw new NotFoundError('Job', jobId);
  }

  return parseJobRow(row);
}

/**
 * Lists all jobs, optionally filtered by status
 */
export function listJobs(status?: JobStatus): Job[] {
  const db = getDb();

  const columns = `id, name, description, status, total_tasks, completed_tasks,
           failed_tasks, job_spec, git_repo_path, created_at, started_at,
           completed_at, created_by, approval_count, required_approvals`;

  let stmt;
  if (status) {
    stmt = db.prepare(`
      SELECT ${columns}
      FROM jobs
      WHERE status = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(status) as any[];
    return rows.map(parseJobRow);
  } else {
    stmt = db.prepare(`
      SELECT ${columns}
      FROM jobs
      ORDER BY created_at DESC
    `);
    const rows = stmt.all() as any[];
    return rows.map(parseJobRow);
  }
}

/**
 * Updates job's completed and failed task counts.
 * Excludes plan task (task_index=0) from counter calculations.
 * Handles executing → completed/failed transitions.
 */
export function updateJobCounters(jobId: string): void {
  const db = getDb();

  const transaction = db.transaction(() => {
    // Count completed and failed tasks, EXCLUDING the plan task (task_index=0)
    const countStmt = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status IN ('failed', 'expired') THEN 1 END) as failed,
        COUNT(*) as total
      FROM tasks
      WHERE job_id = ? AND task_index > 0
    `);

    const counts = countStmt.get(jobId) as any;

    if (!counts) {
      logger.warn(SERVICE_NAME, `No tasks found for job ${jobId}`);
      return;
    }

    const { completed, failed, total } = counts;

    // Update job counters
    const updateCountersStmt = db.prepare(`
      UPDATE jobs
      SET completed_tasks = ?, failed_tasks = ?
      WHERE id = ?
    `);

    updateCountersStmt.run(completed, failed, jobId);

    logger.debug(SERVICE_NAME, `Updated counters for job ${jobId}`, {
      completed,
      failed,
      total,
    });

    // Check if any task is actively running → transition to executing
    const job = db.prepare(`SELECT status FROM jobs WHERE id = ?`).get(jobId) as any;
    if (job && job.status === 'ready') {
      const hasActive = db.prepare(`
        SELECT COUNT(*) as cnt FROM tasks
        WHERE job_id = ? AND task_index > 0 AND status IN ('assigned', 'in_progress')
      `).get(jobId) as any;

      if (hasActive && hasActive.cnt > 0) {
        db.prepare(`
          UPDATE jobs SET status = 'executing', started_at = COALESCE(started_at, datetime('now'))
          WHERE id = ?
        `).run(jobId);
        jobEventsService.recordEvent(jobId, 'execution_started', null);
        logger.info(SERVICE_NAME, `Job ${jobId} transitioned to executing`);
      }
    }

    // Check if job should transition to completed or failed
    if (completed + failed === total && total > 0) {
      const now = new Date().toISOString();
      const newStatus = failed === 0 ? 'completed' : 'failed';

      const updateStatusStmt = db.prepare(`
        UPDATE jobs
        SET status = ?, completed_at = ?
        WHERE id = ?
      `);

      updateStatusStmt.run(newStatus, now, jobId);

      jobEventsService.recordEvent(jobId, newStatus, null, { completed, failed });

      logger.info(SERVICE_NAME, `Job ${jobId} transitioned to ${newStatus}`, {
        completed,
        failed,
      });
    }
  });

  try {
    transaction();
  } catch (error) {
    logger.error(SERVICE_NAME, `Failed to update job counters for ${jobId}`, error);
    throw error;
  }
}

/**
 * Gets statistics about jobs grouped by status
 */
export function getJobStats(): { total: number; by_status: Record<string, number> } {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM jobs
    GROUP BY status
  `);

  const rows = stmt.all() as Array<{ status: string; count: number }>;
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const byStatus: Record<string, number> = {};

  for (const row of rows) {
    byStatus[row.status] = row.count;
  }

  return { total, by_status: byStatus };
}

/**
 * Helper: Parse a job row from database
 */
function parseJobRow(row: any): Job {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as JobStatus,
    approval_count: row.approval_count ?? 0,
    required_approvals: row.required_approvals ?? 5,
    total_tasks: row.total_tasks,
    completed_tasks: row.completed_tasks,
    failed_tasks: row.failed_tasks,
    job_spec: JSON.parse(row.job_spec),
    git_repo_path: row.git_repo_path,
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_by: row.created_by,
  };
}
