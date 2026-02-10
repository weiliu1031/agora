import { getDb } from '../database/db.js';
import type { JobApproval } from '../models/types.js';
import { logger } from '../utils/logger.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../utils/errors.js';
import * as jobEventsService from './job-events.service.js';
import { createPlanTask, getJob } from './job.service.js';

const SERVICE_NAME = 'ApprovalService';

/**
 * Approve a job. Handles status transitions and rate limiting.
 */
export function approveJob(jobId: string, agentId: string): JobApproval {
  const db = getDb();

  // Validate job exists and is in approvable status
  const job = getJob(jobId);
  if (job.status !== 'committed' && job.status !== 'approving') {
    throw new ConflictError(
      `Job ${jobId} is in status '${job.status}', cannot approve (must be committed or approving)`
    );
  }

  // Check rate limit: agent can only approve 1 job per hour
  const rateCheck = canAgentApprove(agentId);
  if (!rateCheck.can_approve) {
    const err = new ValidationError(
      `Agent ${agentId} can only approve one job per hour. Wait ${Math.ceil(rateCheck.time_until_next_ms / 60000)} minutes.`
    );
    (err as any).statusCode = 429;
    (err as any).code = 'APPROVAL_RATE_LIMITED';
    (err as any).details = { retry_after_ms: rateCheck.time_until_next_ms };
    throw err;
  }

  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    // Insert approval (UNIQUE constraint prevents duplicates)
    const insertStmt = db.prepare(`
      INSERT INTO job_approvals (job_id, agent_id, created_at)
      VALUES (?, ?, ?)
    `);

    try {
      insertStmt.run(jobId, agentId, now);
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw new ConflictError(`Agent ${agentId} has already approved job ${jobId}`);
      }
      throw err;
    }

    // Increment approval count
    const updateStmt = db.prepare(`
      UPDATE jobs SET approval_count = approval_count + 1 WHERE id = ?
    `);
    updateStmt.run(jobId);

    // Get updated count
    const countRow = db.prepare(`SELECT approval_count, required_approvals FROM jobs WHERE id = ?`).get(jobId) as any;
    const newCount = countRow.approval_count;
    const required = countRow.required_approvals;

    // Record approval event
    jobEventsService.recordEvent(jobId, 'approved', agentId, {
      approval_number: newCount,
      required: required,
    });

    // Status transitions
    if (newCount === 1 && job.status === 'committed') {
      // First approval: committed → approving
      db.prepare(`UPDATE jobs SET status = 'approving' WHERE id = ?`).run(jobId);
      jobEventsService.recordEvent(jobId, 'approval_started', null, { approval_count: newCount });
      logger.info(SERVICE_NAME, `Job ${jobId} transitioned to approving (1/${required})`);
    }

    if (newCount >= required) {
      // Reached required approvals: approving → accepted
      db.prepare(`UPDATE jobs SET status = 'accepted' WHERE id = ?`).run(jobId);
      jobEventsService.recordEvent(jobId, 'accepted', null, { approval_count: newCount });
      logger.info(SERVICE_NAME, `Job ${jobId} accepted with ${newCount} approvals`);
    }

    return {
      id: 0, // will be set from lastInsertRowid
      job_id: jobId,
      agent_id: agentId,
      created_at: now,
    };
  });

  const approval = transaction();

  // After transaction: if job just became accepted, create plan task
  const updatedJob = getJob(jobId);
  if (updatedJob.status === 'accepted') {
    try {
      createPlanTask(jobId);
    } catch (err) {
      logger.error(SERVICE_NAME, `Failed to create plan task for job ${jobId}`, err);
    }
  }

  return approval;
}

/**
 * Get all approvals for a job
 */
export function getApprovals(jobId: string): JobApproval[] {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT ja.id, ja.job_id, ja.agent_id, ja.created_at
    FROM job_approvals ja
    WHERE ja.job_id = ?
    ORDER BY ja.created_at ASC
  `);

  return stmt.all(jobId) as JobApproval[];
}

/**
 * Check if an agent can approve a job (1 approval per hour rate limit)
 */
export function canAgentApprove(agentId: string): {
  can_approve: boolean;
  last_approval_time?: string;
  time_until_next_ms: number;
} {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT MAX(created_at) as last_approval
    FROM job_approvals
    WHERE agent_id = ?
    AND created_at > datetime('now', '-1 hour')
  `);

  const row = stmt.get(agentId) as any;

  if (!row || !row.last_approval) {
    return { can_approve: true, time_until_next_ms: 0 };
  }

  const lastTime = new Date(row.last_approval.includes('T') ? row.last_approval : row.last_approval + 'Z').getTime();
  const oneHourLater = lastTime + 3600_000;
  const remaining = oneHourLater - Date.now();

  if (remaining <= 0) {
    return { can_approve: true, time_until_next_ms: 0 };
  }

  return {
    can_approve: false,
    last_approval_time: row.last_approval,
    time_until_next_ms: remaining,
  };
}
