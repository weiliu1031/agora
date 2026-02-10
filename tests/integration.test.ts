import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import app from '../src/server/app.js';
import { getDb, closeDb } from '../src/server/database/db.js';
import { startScheduler, stopScheduler } from '../src/server/services/scheduler.js';

const PORT = 13579;
const BASE = `http://localhost:${PORT}`;
let server: Server;

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

beforeAll(async () => {
  // Clean the actual database tables
  const db = getDb();
  db.exec('DELETE FROM task_progress');
  db.exec('DELETE FROM task_history');
  db.exec('DELETE FROM job_events');
  db.exec('DELETE FROM job_approvals');
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM jobs');
  db.exec('DELETE FROM agents');

  server = app.listen(PORT);
  await new Promise<void>((resolve) => server.on('listening', resolve));
});

afterAll(async () => {
  stopScheduler();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
});

describe('Agora Integration', () => {
  let agent1Id: string;
  let agent2Id: string;
  let agent3Id: string;
  let agent4Id: string;
  let agent5Id: string;
  let jobId: string;

  it('health check returns healthy', async () => {
    const res = await api('GET', '/api/health');
    expect(res.success).toBe(true);
    expect(res.data.status).toBe('healthy');
  });

  // Register 5 agents (needed for 5 approvals)
  it('registers agents', async () => {
    const names = ['Agent-Alpha', 'Agent-Beta', 'Agent-Gamma', 'Agent-Delta', 'Agent-Epsilon'];
    const ids: string[] = [];
    for (const name of names) {
      const res = await api('POST', '/api/agents/register', {
        name,
        version: '1.0.0',
        capabilities: { formats: ['txt'] },
      });
      expect(res.success).toBe(true);
      ids.push(res.data.id);
    }
    [agent1Id, agent2Id, agent3Id, agent4Id, agent5Id] = ids;
  });

  it('lists agents', async () => {
    const res = await api('GET', '/api/agents');
    expect(res.success).toBe(true);
    expect(res.data.length).toBe(5);
  });

  it('agent heartbeat works', async () => {
    const res = await api('POST', `/api/agents/${agent1Id}/heartbeat`, {
      status: 'online',
    });
    expect(res.success).toBe(true);
    expect(res.data.acknowledged_at).toBeTruthy();
  });

  // ===== New Workflow: Submit → Approve → Plan → Execute =====

  it('submits a job (committed status, 0 tasks)', async () => {
    const res = await api('POST', '/api/jobs', {
      name: 'Test Batch Processing',
      description: 'Process 5 data batches',
      job_spec: {
        operation: 'batch_process',
        data_files: ['data_0.txt', 'data_1.txt', 'data_2.txt', 'data_3.txt', 'data_4.txt'],
      },
    });

    expect(res.success).toBe(true);
    expect(res.data.status).toBe('committed');
    expect(res.data.total_tasks).toBe(0);
    expect(res.data.approval_count).toBe(0);
    jobId = res.data.id;
  });

  it('job starts with submitted event', async () => {
    const res = await api('GET', `/api/jobs/${jobId}/events`);
    expect(res.success).toBe(true);
    expect(res.data.length).toBeGreaterThanOrEqual(1);
    expect(res.data[0].event_type).toBe('submitted');
  });

  it('no tasks available before approval', async () => {
    const res = await api('POST', '/api/tasks/claim', { agent_id: agent1Id });
    expect(res.success).toBe(true);
    expect(res.data.task).toBeNull();
  });

  it('first approval transitions to approving', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/approve`, { agent_id: agent1Id });
    expect(res.success).toBe(true);

    const jobRes = await api('GET', `/api/jobs/${jobId}`);
    expect(jobRes.data.status).toBe('approving');
    expect(jobRes.data.approval_count).toBe(1);
  });

  it('duplicate approval rejected', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/approve`, { agent_id: agent1Id });
    expect(res.success).toBe(false);
  });

  it('approvals 2-4 keep status as approving', async () => {
    for (const agentId of [agent2Id, agent3Id, agent4Id]) {
      const res = await api('POST', `/api/jobs/${jobId}/approve`, { agent_id: agentId });
      expect(res.success).toBe(true);
    }

    const jobRes = await api('GET', `/api/jobs/${jobId}`);
    expect(jobRes.data.status).toBe('approving');
    expect(jobRes.data.approval_count).toBe(4);
  });

  it('5th approval transitions to accepted → planning', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/approve`, { agent_id: agent5Id });
    expect(res.success).toBe(true);

    const jobRes = await api('GET', `/api/jobs/${jobId}`);
    // Should be 'planning' because createPlanTask runs on acceptance
    expect(jobRes.data.status).toBe('planning');
    expect(jobRes.data.approval_count).toBe(5);
  });

  it('get approvals for job', async () => {
    const res = await api('GET', `/api/jobs/${jobId}/approvals`);
    expect(res.success).toBe(true);
    expect(res.data.length).toBe(5);
  });

  it('plan task is available for claiming', async () => {
    const res = await api('POST', '/api/tasks/claim', { agent_id: agent1Id });
    expect(res.success).toBe(true);
    expect(res.data.task).toBeTruthy();
    expect(res.data.task.task_index).toBe(0);
    expect(res.data.task.task_spec.type).toBe('plan');
  });

  it('agent completes plan task with task_specs', async () => {
    const planTaskId = `${jobId}_task_0`;

    // Start the plan task
    await api('POST', `/api/tasks/${planTaskId}/start`, { agent_id: agent1Id });

    // Complete with task_specs that create actual tasks
    const res = await api('POST', `/api/tasks/${planTaskId}/complete`, {
      agent_id: agent1Id,
      result: {
        task_specs: [
          { specification: { operation: 'process', batch: 0, input: 'data_0.txt' } },
          { specification: { operation: 'process', batch: 1, input: 'data_1.txt' } },
          { specification: { operation: 'process', batch: 2, input: 'data_2.txt' } },
          { specification: { operation: 'process', batch: 3, input: 'data_3.txt' } },
          { specification: { operation: 'process', batch: 4, input: 'data_4.txt' } },
        ],
      },
    });
    expect(res.success).toBe(true);

    // Job should now be in ready status with 5 tasks
    const jobRes = await api('GET', `/api/jobs/${jobId}`);
    expect(jobRes.data.status).toBe('ready');
    expect(jobRes.data.total_tasks).toBe(5);
  });

  it('lists tasks for the job (plan + 5 actual)', async () => {
    const res = await api('GET', `/api/jobs/${jobId}/tasks`);
    expect(res.success).toBe(true);
    expect(res.data.length).toBe(6); // 1 plan + 5 actual
    expect(res.data[0].task_spec.type).toBe('plan');
    expect(res.data[0].status).toBe('completed');
    expect(res.data[1].status).toBe('pending');
  });

  it('agent 1 claims and completes task 1', async () => {
    const claimRes = await api('POST', '/api/tasks/claim', { agent_id: agent1Id });
    expect(claimRes.success).toBe(true);
    expect(claimRes.data.task.task_index).toBe(1);

    const taskId = claimRes.data.task.id;
    await api('POST', `/api/tasks/${taskId}/start`, { agent_id: agent1Id });

    const progRes = await api('POST', `/api/tasks/${taskId}/progress`, {
      agent_id: agent1Id,
      progress_percent: 50,
      message: 'Halfway done',
    });
    expect(progRes.success).toBe(true);

    const completeRes = await api('POST', `/api/tasks/${taskId}/complete`, {
      agent_id: agent1Id,
      result: { output: 'processed_0.txt', records: 100 },
    });
    expect(completeRes.success).toBe(true);
  });

  it('agent 2 claims and completes task 2', async () => {
    // Set agent 2 online first
    await api('POST', `/api/agents/${agent2Id}/heartbeat`, { status: 'online' });

    const claimRes = await api('POST', '/api/tasks/claim', { agent_id: agent2Id });
    expect(claimRes.success).toBe(true);
    expect(claimRes.data.task.task_index).toBe(2);

    const taskId = claimRes.data.task.id;
    await api('POST', `/api/tasks/${taskId}/start`, { agent_id: agent2Id });

    const completeRes = await api('POST', `/api/tasks/${taskId}/complete`, {
      agent_id: agent2Id,
      result: { output: 'processed_1.txt', records: 150 },
    });
    expect(completeRes.success).toBe(true);
  });

  it('job progress updates correctly', async () => {
    const res = await api('GET', `/api/jobs/${jobId}`);
    expect(res.success).toBe(true);
    expect(res.data.completed_tasks).toBe(2);
    // 2/5 = 40%
    expect(res.data.progress_percent).toBe(40);
  });

  it('agent 1 claims and completes remaining tasks', async () => {
    for (let i = 3; i <= 5; i++) {
      const claimRes = await api('POST', '/api/tasks/claim', { agent_id: agent1Id });
      expect(claimRes.success).toBe(true);
      const task = claimRes.data.task;
      expect(task).toBeTruthy();

      await api('POST', `/api/tasks/${task.id}/start`, { agent_id: agent1Id });

      const completeRes = await api('POST', `/api/tasks/${task.id}/complete`, {
        agent_id: agent1Id,
        result: { output: `processed_${i}.txt` },
      });
      expect(completeRes.success).toBe(true);
    }
  });

  it('no more tasks available after all completed', async () => {
    const res = await api('POST', '/api/tasks/claim', { agent_id: agent1Id });
    expect(res.success).toBe(true);
    expect(res.data.task).toBeNull();
  });

  it('job is completed with 100% progress', async () => {
    const res = await api('GET', `/api/jobs/${jobId}`);
    expect(res.success).toBe(true);
    expect(res.data.completed_tasks).toBe(5);
    expect(res.data.progress_percent).toBe(100);
    expect(['completed', 'executing']).toContain(res.data.status);
  });

  it('stats endpoint works', async () => {
    const res = await api('GET', '/api/stats');
    expect(res.success).toBe(true);
    expect(res.data.agents.total).toBe(5);
    expect(res.data.jobs.total).toBeGreaterThanOrEqual(1);
    expect(res.data.tasks.total).toBeGreaterThanOrEqual(6); // 1 plan + 5 actual
  });

  it('can-approve endpoint works', async () => {
    const res = await api('GET', `/api/agents/${agent1Id}/can-approve`);
    expect(res.success).toBe(true);
    // Agent1 approved within the last hour, so can_approve should be false
    expect(res.data.can_approve).toBe(false);
    expect(res.data.time_until_next_ms).toBeGreaterThan(0);
  });
});
