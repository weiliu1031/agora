import type {
  ClientConfig,
  ApiResponse,
  ClaimedTask,
  JobStatus,
  TaskStatus,
} from './types.js';

export type { ClientConfig, ClaimedTask, JobStatus, TaskStatus } from './types.js';

export class AgoraClient {
  private config: Required<ClientConfig>;
  private agentId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: ClientConfig) {
    this.config = {
      heartbeatIntervalMs: 30_000,
      requestTimeoutMs: 30_000,
      version: '1.0.0',
      capabilities: {},
      ...config,
    };
  }

  // ===== Discovery & Registration =====

  async discover(): Promise<boolean> {
    try {
      const res = await this.request<{ status: string }>('GET', '/api/health');
      return res.success && res.data?.status === 'healthy';
    } catch {
      return false;
    }
  }

  async register(): Promise<string> {
    const res = await this.request<{
      id: string;
      heartbeat_interval_ms: number;
    }>('POST', '/api/agents/register', {
      name: this.config.agentName,
      version: this.config.version,
      capabilities: this.config.capabilities,
    });

    if (!res.success || !res.data) {
      throw new Error(`Registration failed: ${res.error?.message}`);
    }

    this.agentId = res.data.id;

    // Start heartbeat
    const interval = res.data.heartbeat_interval_ms || this.config.heartbeatIntervalMs;
    this.startHeartbeat(interval);

    return this.agentId;
  }

  async unregister(): Promise<void> {
    this.stopHeartbeat();
    if (this.agentId) {
      try {
        await this.request('POST', `/api/agents/${this.agentId}/heartbeat`, {
          status: 'offline',
        });
      } catch {
        // Best effort
      }
      this.agentId = null;
    }
  }

  // ===== Task Execution Flow =====

  async claimTask(): Promise<ClaimedTask | null> {
    this.ensureRegistered();

    const res = await this.request<{ task: ClaimedTask | null }>(
      'POST',
      '/api/tasks/claim',
      { agent_id: this.agentId }
    );

    if (!res.success) {
      throw new Error(`Claim failed: ${res.error?.message}`);
    }

    return res.data?.task ?? null;
  }

  async startTask(taskId: string): Promise<void> {
    this.ensureRegistered();

    const res = await this.request('POST', `/api/tasks/${taskId}/start`, {
      agent_id: this.agentId,
    });

    if (!res.success) {
      throw new Error(`Start failed: ${res.error?.message}`);
    }
  }

  async reportProgress(
    taskId: string,
    progressPercent: number,
    message?: string
  ): Promise<void> {
    this.ensureRegistered();

    const res = await this.request('POST', `/api/tasks/${taskId}/progress`, {
      agent_id: this.agentId,
      progress_percent: progressPercent,
      message,
    });

    if (!res.success) {
      throw new Error(`Progress report failed: ${res.error?.message}`);
    }
  }

  async completeTask(
    taskId: string,
    result: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.ensureRegistered();

    const res = await this.request('POST', `/api/tasks/${taskId}/complete`, {
      agent_id: this.agentId,
      result,
      metadata,
    });

    if (!res.success) {
      throw new Error(`Complete failed: ${res.error?.message}`);
    }
  }

  async failTask(
    taskId: string,
    errorMessage: string,
    shouldRetry = true
  ): Promise<{ will_retry: boolean }> {
    this.ensureRegistered();

    const res = await this.request<{ will_retry: boolean }>(
      'POST',
      `/api/tasks/${taskId}/fail`,
      {
        agent_id: this.agentId,
        error_message: errorMessage,
        should_retry: shouldRetry,
      }
    );

    if (!res.success) {
      throw new Error(`Fail report failed: ${res.error?.message}`);
    }

    return res.data!;
  }

  // ===== Queries =====

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const res = await this.request<JobStatus>('GET', `/api/jobs/${jobId}`);

    if (!res.success || !res.data) {
      throw new Error(`Get job failed: ${res.error?.message}`);
    }

    return res.data;
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const res = await this.request<TaskStatus>('GET', `/api/tasks/${taskId}`);

    if (!res.success || !res.data) {
      throw new Error(`Get task failed: ${res.error?.message}`);
    }

    return res.data;
  }

  async listJobs(): Promise<JobStatus[]> {
    const res = await this.request<JobStatus[]>('GET', '/api/jobs');

    if (!res.success || !res.data) {
      throw new Error(`List jobs failed: ${res.error?.message}`);
    }

    return res.data;
  }

  // ===== Job Submission (for orchestrators) =====

  async submitJob(
    name: string,
    jobSpec: Record<string, unknown>,
    description?: string
  ): Promise<{ job_id: string; status: string }> {
    const res = await this.request<{ id: string; status: string }>(
      'POST',
      '/api/jobs',
      { name, description, job_spec: jobSpec }
    );

    if (!res.success || !res.data) {
      throw new Error(`Submit job failed: ${res.error?.message}`);
    }

    return { job_id: res.data.id, status: res.data.status };
  }

  // ===== Approval =====

  async approveJob(jobId: string): Promise<void> {
    this.ensureRegistered();

    const res = await this.request('POST', `/api/jobs/${jobId}/approve`, {
      agent_id: this.agentId,
    });

    if (!res.success) {
      throw new Error(`Approve failed: ${res.error?.message}`);
    }
  }

  async canApprove(): Promise<{
    can_approve: boolean;
    time_until_next_ms: number;
  }> {
    this.ensureRegistered();

    const res = await this.request<{
      can_approve: boolean;
      time_until_next_ms: number;
    }>('GET', `/api/agents/${this.agentId}/can-approve`);

    if (!res.success || !res.data) {
      throw new Error(`Can-approve check failed: ${res.error?.message}`);
    }

    return res.data;
  }

  // ===== Getters =====

  getAgentId(): string | null {
    return this.agentId;
  }

  isRegistered(): boolean {
    return this.agentId !== null;
  }

  // ===== Internal =====

  private ensureRegistered(): void {
    if (!this.agentId) {
      throw new Error(
        'Agent not registered. Call register() first.'
      );
    }
  }

  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.request('POST', `/api/agents/${this.agentId}/heartbeat`, {
          status: 'online',
        });
      } catch (err) {
        console.warn('[AgentClient] Heartbeat failed:', (err as Error).message);
      }
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs
    );

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const json = await res.json();
      return json as ApiResponse<T>;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`Request timeout: ${method} ${path}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
