import { Router, Request, Response } from 'express';
import * as jobService from '../services/job.service.js';
import * as taskService from '../services/task.service.js';
import * as approvalService from '../services/approval.service.js';
import * as jobEventsService from '../services/job-events.service.js';
import { AppError } from '../utils/errors.js';
import { JobStatus } from '../models/types.js';

const router = Router();

// Submit a new job (was POST / createJob, now submitJob)
router.post('/', async (req: Request, res: Response) => {
  try {
    const job = await jobService.submitJob(req.body);
    res.status(201).json({ success: true, data: job });
  } catch (error) {
    handleError(res, error);
  }
});

// List all jobs
router.get('/', (req: Request, res: Response) => {
  try {
    const status = req.query.status as JobStatus | undefined;
    const jobs = jobService.listJobs(status);
    res.json({ success: true, data: jobs });
  } catch (error) {
    handleError(res, error);
  }
});

// Get a single job
router.get('/:id', (req: Request, res: Response) => {
  try {
    const job = jobService.getJob(req.params.id as string);
    const progress_percent =
      job.total_tasks > 0
        ? Math.round((job.completed_tasks / job.total_tasks) * 100)
        : 0;
    res.json({ success: true, data: { ...job, progress_percent } });
  } catch (error) {
    handleError(res, error);
  }
});

// List tasks for a job
router.get('/:id/tasks', (req: Request, res: Response) => {
  try {
    const tasks = taskService.listTasksForJob(req.params.id as string);
    res.json({ success: true, data: tasks });
  } catch (error) {
    handleError(res, error);
  }
});

// Approve a job
router.post('/:id/approve', (req: Request, res: Response) => {
  try {
    const approval = approvalService.approveJob(
      req.params.id as string,
      req.body.agent_id
    );
    res.status(201).json({ success: true, data: approval });
  } catch (error) {
    handleError(res, error);
  }
});

// Get all approvals for a job
router.get('/:id/approvals', (req: Request, res: Response) => {
  try {
    const approvals = approvalService.getApprovals(req.params.id as string);
    res.json({ success: true, data: approvals });
  } catch (error) {
    handleError(res, error);
  }
});

// Get all events for a job (for DAG visualization)
router.get('/:id/events', (req: Request, res: Response) => {
  try {
    const events = jobEventsService.getJobEvents(req.params.id as string);
    res.json({ success: true, data: events });
  } catch (error) {
    handleError(res, error);
  }
});

function handleError(res: Response, error: unknown) {
  if (error instanceof AppError) {
    const statusCode = (error as any).statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: {
        code: (error as any).code || 'ERROR',
        message: error.message,
        details: (error as any).details,
      },
    });
  } else {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: (error as Error).message || 'Unknown error' },
    });
  }
}

export default router;
