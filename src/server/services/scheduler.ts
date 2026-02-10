import { getDb } from '../database/db.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { JobStatus } from '../models/types.js';
import * as gitService from './git.service.js';
import * as jobEventsService from './job-events.service.js';

const SERVICE_NAME = 'Scheduler';

// Module-level interval storage
let checkExpiredTasksInterval: ReturnType<typeof setInterval> | null = null;
let checkStaleAgentsInterval: ReturnType<typeof setInterval> | null = null;
let syncJobStatusesInterval: ReturnType<typeof setInterval> | null = null;

function checkExpiredTasks(): void {
  try {
    const db = getDb();

    const tasks = db
      .prepare(
        `SELECT id, job_id, assigned_at, timeout_seconds, retry_count, max_retries
         FROM tasks WHERE status IN ('assigned', 'in_progress')`
      )
      .all() as Array<{
      id: string;
      job_id: string;
      assigned_at: string | null;
      timeout_seconds: number;
      retry_count: number;
      max_retries: number;
    }>;

    let expiredCount = 0;

    for (const task of tasks) {
      if (!task.assigned_at) continue;

      const expirationTime =
        new Date(task.assigned_at).getTime() + task.timeout_seconds * 1000;

      if (expirationTime < Date.now()) {
        expiredCount++;

        if (task.retry_count < task.max_retries) {
          db.prepare(
            `UPDATE tasks SET status = 'pending', claimed_by = NULL, assigned_at = NULL,
             started_at = NULL, progress_percent = 0, retry_count = retry_count + 1
             WHERE id = ?`
          ).run(task.id);

          db.prepare(
            `INSERT INTO task_history (task_id, event_type, details) VALUES (?, 'expired_retried', ?)`
          ).run(task.id, JSON.stringify({ retry_count: task.retry_count + 1 }));
        } else {
          db.prepare(
            `UPDATE tasks SET status = 'expired', completed_at = datetime('now') WHERE id = ?`
          ).run(task.id);

          db.prepare(
            `INSERT INTO task_history (task_id, event_type) VALUES (?, 'expired')`
          ).run(task.id);
        }

        // Recalculate job counters (excluding plan task at index 0)
        const counters = db
          .prepare(
            `SELECT
              COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
              COUNT(CASE WHEN status IN ('failed', 'expired') THEN 1 END) as failed,
              COUNT(*) as total
             FROM tasks WHERE job_id = ? AND task_index > 0`
          )
          .get(task.job_id) as { completed: number; failed: number; total: number };

        db.prepare(
          `UPDATE jobs SET completed_tasks = ?, failed_tasks = ? WHERE id = ?`
        ).run(counters.completed, counters.failed, task.job_id);

        // Check if all active tasks are done
        const activeCount = db
          .prepare(
            `SELECT COUNT(*) as cnt FROM tasks
             WHERE job_id = ? AND task_index > 0 AND status IN ('pending', 'assigned', 'in_progress')`
          )
          .get(task.job_id) as { cnt: number };

        if (activeCount.cnt === 0 && counters.total > 0) {
          const newStatus = counters.failed > 0 ? JobStatus.Failed : JobStatus.Completed;
          db.prepare(
            `UPDATE jobs SET status = ?, completed_at = datetime('now') WHERE id = ?`
          ).run(newStatus, task.job_id);

          jobEventsService.recordEvent(task.job_id, newStatus, null, {
            completed: counters.completed,
            failed: counters.failed,
          });
        }
      }
    }

    if (expiredCount > 0) {
      logger.info(SERVICE_NAME, `Expired ${expiredCount} task(s) in this cycle`);
    }
  } catch (error) {
    logger.error(
      SERVICE_NAME,
      'Error in checkExpiredTasks',
      error instanceof Error ? error.message : String(error)
    );
  }
}

function checkStaleAgents(): void {
  try {
    const db = getDb();
    const graceSeconds = config.scheduler.agentHeartbeatGraceSeconds;

    const staleAgents = db
      .prepare(
        `SELECT id FROM agents
         WHERE status = 'online' AND last_heartbeat < datetime('now', ?)`
      )
      .all(`-${graceSeconds} seconds`) as Array<{ id: string }>;

    for (const agent of staleAgents) {
      db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('offline', agent.id);

      const tasks = db
        .prepare(
          `SELECT id, retry_count, max_retries FROM tasks
           WHERE claimed_by = ? AND status IN ('assigned', 'in_progress')`
        )
        .all(agent.id) as Array<{ id: string; retry_count: number; max_retries: number }>;

      for (const task of tasks) {
        if (task.retry_count < task.max_retries) {
          db.prepare(
            `UPDATE tasks SET status = 'pending', claimed_by = NULL, assigned_at = NULL,
             started_at = NULL, progress_percent = 0, retry_count = retry_count + 1
             WHERE id = ?`
          ).run(task.id);
        } else {
          db.prepare(
            `UPDATE tasks SET status = 'failed', completed_at = datetime('now') WHERE id = ?`
          ).run(task.id);
        }

        db.prepare(
          `INSERT INTO task_history (task_id, event_type, agent_id) VALUES (?, 'agent_offline', ?)`
        ).run(task.id, agent.id);
      }

      if (tasks.length > 0) {
        logger.info(SERVICE_NAME, `Agent ${agent.id} went offline, reset ${tasks.length} task(s)`);
      }
    }

    if (staleAgents.length > 0) {
      logger.info(SERVICE_NAME, `Marked ${staleAgents.length} agent(s) as offline`);
    }
  } catch (error) {
    logger.error(
      SERVICE_NAME,
      'Error in checkStaleAgents',
      error instanceof Error ? error.message : String(error)
    );
  }
}

function syncJobStatuses(): void {
  try {
    const db = getDb();

    // Ready → Executing (when any real task is assigned/in_progress)
    const readyJobs = db
      .prepare(
        `SELECT DISTINCT j.id FROM jobs j
         WHERE j.status = ? AND EXISTS (
           SELECT 1 FROM tasks t WHERE t.job_id = j.id AND t.task_index > 0
             AND t.status IN ('assigned', 'in_progress')
         )`
      )
      .all(JobStatus.Ready) as Array<{ id: string }>;

    for (const job of readyJobs) {
      db.prepare(
        `UPDATE jobs SET status = ?, started_at = COALESCE(started_at, datetime('now')) WHERE id = ?`
      ).run(JobStatus.Executing, job.id);

      jobEventsService.recordEvent(job.id, 'execution_started', null);
    }

    // Executing → Completed/Failed (when all real tasks are done)
    const executingJobs = db
      .prepare(`SELECT j.id FROM jobs j WHERE j.status = ?`)
      .all(JobStatus.Executing) as Array<{ id: string }>;

    for (const job of executingJobs) {
      const counts = db
        .prepare(
          `SELECT
            COUNT(CASE WHEN status IN ('pending', 'assigned', 'in_progress') THEN 1 END) as active,
            COUNT(CASE WHEN status IN ('failed', 'expired') THEN 1 END) as failed
           FROM tasks WHERE job_id = ? AND task_index > 0`
        )
        .get(job.id) as { active: number; failed: number };

      if (counts.active === 0) {
        const newStatus = counts.failed > 0 ? JobStatus.Failed : JobStatus.Completed;
        db.prepare(
          `UPDATE jobs SET status = ?, completed_at = datetime('now') WHERE id = ?`
        ).run(newStatus, job.id);

        jobEventsService.recordEvent(job.id, newStatus, null, { failed: counts.failed });

        gitService.commitJobStatus(job.id, newStatus).catch(() => {});
      }
    }

    // Planning → ready (backup check: if plan task completed but job still 'planning')
    const planningJobs = db
      .prepare(`SELECT j.id FROM jobs j WHERE j.status = ?`)
      .all(JobStatus.Planning) as Array<{ id: string }>;

    for (const job of planningJobs) {
      const planTask = db
        .prepare(
          `SELECT status FROM tasks WHERE job_id = ? AND task_index = 0`
        )
        .get(job.id) as { status: string } | undefined;

      if (planTask && planTask.status === 'completed') {
        // Check if real tasks exist (meaning handlePlanCompletion already ran)
        const realTaskCount = db
          .prepare(`SELECT COUNT(*) as cnt FROM tasks WHERE job_id = ? AND task_index > 0`)
          .get(job.id) as { cnt: number };

        if (realTaskCount.cnt > 0) {
          // handlePlanCompletion already created tasks but job status wasn't updated
          db.prepare(`UPDATE jobs SET status = 'ready' WHERE id = ?`).run(job.id);
          logger.info(SERVICE_NAME, `Backup: Job ${job.id} transitioned from planning to ready`);
        }
      }
    }
  } catch (error) {
    logger.error(
      SERVICE_NAME,
      'Error in syncJobStatuses',
      error instanceof Error ? error.message : String(error)
    );
  }
}

export function startScheduler(): void {
  checkExpiredTasksInterval = setInterval(checkExpiredTasks, config.scheduler.timeoutCheckIntervalMs);
  checkStaleAgentsInterval = setInterval(checkStaleAgents, config.scheduler.heartbeatCheckIntervalMs);
  syncJobStatusesInterval = setInterval(syncJobStatuses, config.scheduler.jobStatusCheckIntervalMs);
  logger.info(SERVICE_NAME, 'Scheduler started with all periodic checks');
}

export function stopScheduler(): void {
  if (checkExpiredTasksInterval) { clearInterval(checkExpiredTasksInterval); checkExpiredTasksInterval = null; }
  if (checkStaleAgentsInterval) { clearInterval(checkStaleAgentsInterval); checkStaleAgentsInterval = null; }
  if (syncJobStatusesInterval) { clearInterval(syncJobStatusesInterval); syncJobStatusesInterval = null; }
  logger.info(SERVICE_NAME, 'Scheduler stopped');
}
