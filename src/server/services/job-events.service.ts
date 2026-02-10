import { getDb } from '../database/db.js';
import type { JobEvent } from '../models/types.js';
import { logger } from '../utils/logger.js';

const SERVICE_NAME = 'JobEventsService';

/**
 * Records a job lifecycle event
 */
export function recordEvent(
  jobId: string,
  eventType: string,
  agentId?: string | null,
  details?: Record<string, unknown> | null
): JobEvent {
  const db = getDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO job_events (job_id, event_type, agent_id, details, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    jobId,
    eventType,
    agentId || null,
    details ? JSON.stringify(details) : null,
    now
  );

  logger.debug(SERVICE_NAME, `Event recorded: ${eventType} for job ${jobId}`);

  return {
    id: result.lastInsertRowid as number,
    job_id: jobId,
    event_type: eventType,
    agent_id: agentId || null,
    details: details || null,
    created_at: now,
  };
}

/**
 * Gets all events for a job, ordered chronologically
 */
export function getJobEvents(jobId: string): JobEvent[] {
  const db = getDb();

  const stmt = db.prepare(`
    SELECT id, job_id, event_type, agent_id, details, created_at
    FROM job_events
    WHERE job_id = ?
    ORDER BY created_at ASC, id ASC
  `);

  const rows = stmt.all(jobId) as any[];
  return rows.map((r) => ({
    id: r.id,
    job_id: r.job_id,
    event_type: r.event_type,
    agent_id: r.agent_id,
    details: r.details ? JSON.parse(r.details) : null,
    created_at: r.created_at,
  }));
}
