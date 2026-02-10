export interface ClientConfig {
  baseUrl: string;
  agentName: string;
  version?: string;
  capabilities?: Record<string, unknown>;
  heartbeatIntervalMs?: number;
  requestTimeoutMs?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ClaimedTask {
  task_id: string;
  job_id: string;
  task_index: number;
  task_spec: Record<string, unknown>;
  timeout_seconds: number;
  claimed_at: string;
}

export interface JobStatus {
  id: string;
  name: string;
  status: string;
  approval_count: number;
  required_approvals: number;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  progress_percent: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TaskStatus {
  id: string;
  job_id: string;
  task_index: number;
  status: string;
  claimed_by: string | null;
  progress_percent: number;
  task_spec: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}
