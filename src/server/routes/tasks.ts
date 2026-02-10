import { Router, Request, Response } from 'express';
import * as taskService from '../services/task.service.js';
import { AppError } from '../utils/errors.js';

const router = Router();

router.post('/claim', (req: Request, res: Response) => {
  try {
    const task = taskService.claimTask(req.body.agent_id);
    if (task === null) {
      res.json({ success: true, data: { task: null, message: 'No tasks available' } });
    } else {
      res.json({ success: true, data: { task } });
    }
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:id/start', (req: Request, res: Response) => {
  try {
    const task = taskService.startTask(req.params.id as string, req.body.agent_id);
    res.json({ success: true, data: task });
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:id/progress', (req: Request, res: Response) => {
  try {
    taskService.reportProgress(
      req.params.id as string,
      req.body.agent_id,
      req.body.progress_percent,
      req.body.message
    );
    res.json({ success: true, data: { acknowledged_at: new Date().toISOString() } });
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const task = await taskService.completeTask(
      req.params.id as string,
      req.body.agent_id,
      req.body.result
    );
    res.json({ success: true, data: task });
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:id/fail', async (req: Request, res: Response) => {
  try {
    const result = await taskService.failTask(
      req.params.id as string,
      req.body.agent_id,
      req.body.error_message,
      req.body.should_retry ?? false
    );
    res.json({ success: true, data: result });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const task = taskService.getTask(req.params.id as string);
    res.json({ success: true, data: task });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:id/history', (req: Request, res: Response) => {
  try {
    const history = taskService.getTaskHistory(req.params.id as string);
    res.json({ success: true, data: history });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:id/progress', (req: Request, res: Response) => {
  try {
    const progress = taskService.getTaskProgressLog(req.params.id as string);
    res.json({ success: true, data: progress });
  } catch (error) {
    handleError(res, error);
  }
});

function handleError(res: Response, error: unknown) {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: { code: error.code, message: error.message },
    });
  } else {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: (error as Error).message || 'Unknown error' },
    });
  }
}

export default router;
