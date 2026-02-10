import { Router, Request, Response } from 'express';
import * as agentService from '../services/agent.service.js';
import * as approvalService from '../services/approval.service.js';
import { AppError } from '../utils/errors.js';
import { AgentStatus } from '../models/types.js';
import { config } from '../config.js';

const router = Router();

router.post('/register', (req: Request, res: Response) => {
  try {
    const agent = agentService.registerAgent(req.body);
    res.status(201).json({
      success: true,
      data: { ...agent, heartbeat_interval_ms: config.agent.heartbeatIntervalMs },
    });
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:id/heartbeat', (req: Request, res: Response) => {
  try {
    const result = agentService.heartbeat(req.params.id as string, req.body.status);
    res.json({ success: true, data: result });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const status = req.query.status as AgentStatus | undefined;
    const agents = agentService.listAgents(status);
    res.json({ success: true, data: agents });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const agent = agentService.getAgent(req.params.id as string);
    res.json({ success: true, data: agent });
  } catch (error) {
    handleError(res, error);
  }
});

// Check if an agent can approve (rate limit: 1 per hour)
router.get('/:id/can-approve', (req: Request, res: Response) => {
  try {
    const result = approvalService.canAgentApprove(req.params.id as string);
    res.json({ success: true, data: result });
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
