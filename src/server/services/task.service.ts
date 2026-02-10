import { getDb } from '../database/db.js';
import type { Task, TaskStatus } from '../models/types.js';
import { logger } from '../utils/logger.js';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  TaskExpiredError,
  ValidationError,
} from '../utils/errors.js';
import * as gitService from './git.service.js';
import { updateJobCounters, handlePlanCompletion } from './job.service.js';

const SERVICE_NAME = 'TaskService';

/**
 * Helper: Check if a task has expired based on assigned_at and timeout_seconds
 */
function isTaskExpired(task: { assigned_at: string | null; timeout_seconds: number }): boolean {
  if (!task.assigned_at) {
    return false;
  }

  const assignedTime = new Date(task.assigned_at).getTime();
  const expiryTime = assignedTime + task.timeout_seconds * 1000;
  return Date.now() > expiryTime;
}

/**
 * Helper: Parse a task row from database
 */
function parseTaskRow(row: any): Task {
  return {
    id: row.id,
    job_id: row.job_id,
    task_index: row.task_index,
    status: row.status as TaskStatus,
    task_spec: JSON.parse(row.task_spec),
    claimed_by: row.claimed_by,
    assigned_at: row.assigned_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    result: row.result ? JSON.parse(row.result) : null,
    error_message: row.error_message,
    progress_percent: row.progress_percent,
    timeout_seconds: row.timeout_seconds,
    retry_count: row.retry_count,
    max_retries: row.max_retries,
    created_at: row.created_at,
  };
}

/**
 * Claims a pending task for an agent.
 * Only claims tasks from jobs that are in planning, ready, or executing status.
 * Uses transaction to ensure atomicity and prevent race conditions.
 */
export function claimTask(agentId: string): Task | null {
  const db = getDb();

  const transaction = db.transaction(() => {
    // Find first pending task, only from jobs in claimable states
    const selectStmt = db.prepare(`
      SELECT t.id, t.job_id, t.task_index, t.status, t.task_spec, t.claimed_by, t.assigned_at,
             t.started_at, t.completed_at, t.result, t.error_message, t.progress_percent,
             t.timeout_seconds, t.retry_count, t.max_retries, t.created_at
      FROM tasks t
      JOIN jobs j ON j.id = t.job_id
      WHERE t.status = 'pending'
        AND j.status IN ('planning', 'ready', 'executing')
      ORDER BY t.task_index ASC
      LIMIT 1
    `);

    const row = selectStmt.get() as any;

    if (!row) {
      return null;
    }

    // Update task to assigned status
    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE tasks
      SET status = ?, claimed_by = ?, assigned_at = ?
      WHERE id = ?
    `);

    updateStmt.run('assigned', agentId, now, row.id);

    // Insert task history event
    const historyStmt = db.prepare(`
      INSERT INTO task_history (task_id, event_type, agent_id, created_at)
      VALUES (?, ?, ?, ?)
    `);

    historyStmt.run(row.id, 'assigned', agentId, now);

    logger.debug(SERVICE_NAME, `Claimed task ${row.id} for agent ${agentId}`);

    // Re-read to get updated fields
    const updatedRow = db.prepare(`
      SELECT id, job_id, task_index, status, task_spec, claimed_by, assigned_at,
             started_at, completed_at, result, error_message, progress_percent,
             timeout_seconds, retry_count, max_retries, created_at
      FROM tasks WHERE id = ?
    `).get(row.id) as any;

    return parseTaskRow(updatedRow);
  });

  try {
    return transaction();
  } catch (error) {
    logger.error(SERVICE_NAME, `Failed to claim task for agent ${agentId}`, error);
    throw error;
  }
}

/**
 * Starts a claimed task (transitions from 'assigned' to 'in_progress')
 */
export function startTask(taskId: string, agentId: string): Task {
  const db = getDb();

  // Get task
  const task = getTask(taskId);

  // Verify ownership
  if (task.claimed_by !== agentId) {
    throw new ForbiddenError(`Task ${taskId} is not claimed by agent ${agentId}`);
  }

  // Verify status
  if (task.status !== 'assigned') {
    throw new ConflictError(
      `Task ${taskId} is in status '${task.status}', expected 'assigned'`
    );
  }

  // Check expiry
  if (isTaskExpired(task)) {
    throw new TaskExpiredError(taskId);
  }

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    // Update task status
    const updateStmt = db.prepare(`
      UPDATE tasks
      SET status = ?, started_at = ?
      WHERE id = ?
    `);

    updateStmt.run('in_progress', now, taskId);

    // Insert history event
    const historyStmt = db.prepare(`
      INSERT INTO task_history (task_id, event_type, agent_id, created_at)
      VALUES (?, ?, ?, ?)
    `);

    historyStmt.run(taskId, 'started', agentId, now);

    // Update parent job to executing if still in ready status
    const jobCheckStmt = db.prepare(`
      SELECT status FROM jobs WHERE id = ?
    `);

    const jobRow = jobCheckStmt.get(task.job_id) as any;

    if (jobRow && jobRow.status === 'ready') {
      const updateJobStmt = db.prepare(`
        UPDATE jobs
        SET status = ?, started_at = ?
        WHERE id = ?
      `);

      updateJobStmt.run('executing', now, task.job_id);

      logger.debug(SERVICE_NAME, `Updated job ${task.job_id} to executing`);
    }

    logger.debug(SERVICE_NAME, `Started task ${taskId} for agent ${agentId}`);
  });

  try {
    transaction();
  } catch (error) {
    logger.error(SERVICE_NAME, `Failed to start task ${taskId}`, error);
    throw error;
  }

  return getTask(taskId);
}

/**
 * Reports progress on an in-progress task
 */
export function reportProgress(
  taskId: string,
  agentId: string,
  progressPercent: number,
  message?: string
): void {
  const db = getDb();

  // Get and verify task
  const task = getTask(taskId);

  if (task.claimed_by !== agentId) {
    throw new ForbiddenError(`Task ${taskId} is not claimed by agent ${agentId}`);
  }

  if (task.status !== 'assigned' && task.status !== 'in_progress') {
    throw new ConflictError(
      `Task ${taskId} is in status '${task.status}', cannot report progress`
    );
  }

  // Check expiry
  if (isTaskExpired(task)) {
    throw new TaskExpiredError(taskId);
  }

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    // Update task progress
    const updateStmt = db.prepare(`
      UPDATE tasks
      SET progress_percent = ?
      WHERE id = ?
    `);

    updateStmt.run(progressPercent, taskId);

    // Insert progress record
    const progressStmt = db.prepare(`
      INSERT INTO task_progress (task_id, agent_id, progress_percent, message, reported_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    progressStmt.run(taskId, agentId, progressPercent, message || null, now);

    // Insert history event
    const historyStmt = db.prepare(`
      INSERT INTO task_history (task_id, event_type, agent_id, details, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    historyStmt.run(
      taskId,
      'progress',
      agentId,
      JSON.stringify({ progress_percent: progressPercent, message }),
      now
    );

    logger.debug(SERVICE_NAME, `Progress reported for task ${taskId}`, {
      progressPercent,
      agentId,
    });
  });

  try {
    transaction();
  } catch (error) {
    logger.error(SERVICE_NAME, `Failed to report progress for task ${taskId}`, error);
    throw error;
  }
}

/**
 * Marks a task as completed with a result.
 * If the completed task is a plan task (task_spec.type === 'plan'),
 * triggers handlePlanCompletion instead of normal counter update.
 */
export async function completeTask(
  taskId: string,
  agentId: string,
  result: Record<string, unknown>
): Promise<Task> {
  const db = getDb();

  // Get and verify task
  const task = getTask(taskId);

  if (task.claimed_by !== agentId) {
    throw new ForbiddenError(`Task ${taskId} is not claimed by agent ${agentId}`);
  }

  if (task.status !== 'assigned' && task.status !== 'in_progress') {
    throw new ConflictError(
      `Task ${taskId} is in status '${task.status}', cannot complete`
    );
  }

  // Check expiry
  if (isTaskExpired(task)) {
    throw new TaskExpiredError(taskId);
  }

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    // Update task
    const updateStmt = db.prepare(`
      UPDATE tasks
      SET status = ?, result = ?, completed_at = ?, progress_percent = ?
      WHERE id = ?
    `);

    updateStmt.run('completed', JSON.stringify(result), now, 100, taskId);

    // Insert history event
    const historyStmt = db.prepare(`
      INSERT INTO task_history (task_id, event_type, agent_id, created_at)
      VALUES (?, ?, ?, ?)
    `);

    historyStmt.run(taskId, 'completed', agentId, now);

    logger.debug(SERVICE_NAME, `Completed task ${taskId} by agent ${agentId}`);
  });

  try {
    transaction();
  } catch (error) {
    logger.error(SERVICE_NAME, `Failed to complete task ${taskId}`, error);
    throw error;
  }

  // Check if this is a plan task
  const isPlanTask = task.task_spec && task.task_spec.type === 'plan';

  if (isPlanTask) {
    // Handle plan task completion: create actual tasks from plan result
    try {
      await handlePlanCompletion(task.job_id, result);
    } catch (error) {
      logger.error(SERVICE_NAME, `Failed to handle plan completion for ${task.job_id}`, error);
    }
  } else {
    // Normal task: update job counters
    try {
      updateJobCounters(task.job_id);
    } catch (error) {
      logger.error(SERVICE_NAME, `Failed to update job counters for ${task.job_id}`, error);
    }

    // Commit result to git (fire and forget)
    gitService
      .commitTaskResult(task.job_id, taskId, task.task_index, agentId, result)
      .catch((error) => {
        logger.error(SERVICE_NAME, `Failed to commit task result for ${taskId}`, error);
      });
  }

  return getTask(taskId);
}

/**
 * Marks a task as failed with error message
 * Can optionally retry if under max_retries limit
 */
export async function failTask(
  taskId: string,
  agentId: string,
  errorMessage: string,
  shouldRetry?: boolean
): Promise<{ will_retry: boolean }> {
  const db = getDb();

  // Get and verify task
  const task = getTask(taskId);

  if (task.claimed_by !== agentId) {
    throw new ForbiddenError(`Task ${taskId} is not claimed by agent ${agentId}`);
  }

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    // Check if we should retry
    const shouldRetryTask = shouldRetry && task.retry_count < task.max_retries;

    if (shouldRetryTask) {
      // Reset task for retry
      const resetStmt = db.prepare(`
        UPDATE tasks
        SET status = ?, claimed_by = ?, assigned_at = ?, started_at = ?,
            retry_count = ?, error_message = ?
        WHERE id = ?
      `);

      resetStmt.run('pending', null, null, null, task.retry_count + 1, errorMessage, taskId);

      // Insert history event
      const historyStmt = db.prepare(`
        INSERT INTO task_history (task_id, event_type, agent_id, details, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      historyStmt.run(
        taskId,
        'retried',
        agentId,
        JSON.stringify({ retry_count: task.retry_count + 1, error: errorMessage }),
        now
      );

      logger.info(SERVICE_NAME, `Task ${taskId} will retry (attempt ${task.retry_count + 1})`);
    } else {
      // Mark as failed
      const failStmt = db.prepare(`
        UPDATE tasks
        SET status = ?, error_message = ?, completed_at = ?
        WHERE id = ?
      `);

      failStmt.run('failed', errorMessage, now, taskId);

      // Insert history event
      const historyStmt = db.prepare(`
        INSERT INTO task_history (task_id, event_type, agent_id, details, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      historyStmt.run(taskId, 'failed', agentId, JSON.stringify({ error: errorMessage }), now);

      logger.info(SERVICE_NAME, `Task ${taskId} failed by agent ${agentId}`);
    }
  });

  try {
    transaction();
  } catch (error) {
    logger.error(SERVICE_NAME, `Failed to fail task ${taskId}`, error);
    throw error;
  }

  // Only update counters if not retrying
  if (!shouldRetry || task.retry_count >= task.max_retries) {
    try {
      updateJobCounters(task.job_id);
    } catch (error) {
      logger.error(SERVICE_NAME, `Failed to update job counters for ${task.job_id}`, error);
    }
  }

  return {
    will_retry: !!(shouldRetry && task.retry_count < task.max_retries),
  };
}

/**
 * Retrieves a task by ID
 */
export function getTask(taskId: string): Task {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT id, job_id, task_index, status, task_spec, claimed_by, assigned_at,
           started_at, completed_at, result, error_message, progress_percent,
           timeout_seconds, retry_count, max_retries, created_at
    FROM tasks
    WHERE id = ?
  `);

  const row = stmt.get(taskId) as any;

  if (!row) {
    throw new NotFoundError('Task', taskId);
  }

  return parseTaskRow(row);
}

/**
 * Lists all tasks for a job, ordered by task_index
 */
export function listTasksForJob(jobId: string): Task[] {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT id, job_id, task_index, status, task_spec, claimed_by, assigned_at,
           started_at, completed_at, result, error_message, progress_percent,
           timeout_seconds, retry_count, max_retries, created_at
    FROM tasks
    WHERE job_id = ?
    ORDER BY task_index ASC
  `);

  const rows = stmt.all(jobId) as any[];
  return rows.map(parseTaskRow);
}

/**
 * Gets the history log for a task (all events)
 */
export function getTaskHistory(taskId: string): Array<{
  id: number;
  task_id: string;
  event_type: string;
  agent_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}> {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, task_id, event_type, agent_id, details, created_at
    FROM task_history
    WHERE task_id = ?
    ORDER BY created_at ASC
  `);
  const rows = stmt.all(taskId) as any[];
  return rows.map((r) => ({
    id: r.id,
    task_id: r.task_id,
    event_type: r.event_type,
    agent_id: r.agent_id,
    details: r.details ? JSON.parse(r.details) : null,
    created_at: r.created_at,
  }));
}

/**
 * Gets the progress log for a task
 */
export function getTaskProgressLog(taskId: string): Array<{
  id: number;
  task_id: string;
  agent_id: string;
  progress_percent: number;
  message: string | null;
  reported_at: string;
}> {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, task_id, agent_id, progress_percent, message, reported_at
    FROM task_progress
    WHERE task_id = ?
    ORDER BY reported_at ASC
  `);
  return stmt.all(taskId) as any[];
}

/**
 * Gets statistics about tasks grouped by status
 */
export function getTaskStats(): { total: number; by_status: Record<string, number> } {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM tasks
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
