// ===== Enums =====

export enum JobStatus {
  Committed = 'committed',
  Approving = 'approving',
  Accepted = 'accepted',
  Planning = 'planning',
  Ready = 'ready',
  Executing = 'executing',
  Completed = 'completed',
  Failed = 'failed',
}

export enum TaskStatus {
  Pending = 'pending',
  Assigned = 'assigned',
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed',
  Expired = 'expired',
}

export enum AgentStatus {
  Registered = 'registered',
  Online = 'online',
  Offline = 'offline',
}

// ===== Core Interfaces =====

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  version?: string;
  capabilities?: Record<string, unknown>;
  registered_at: string;
  last_heartbeat: string | null;
}

export interface Job {
  id: string;
  name: string;
  description?: string;
  status: JobStatus;
  approval_count: number;
  required_approvals: number;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  job_spec: Record<string, unknown>;
  git_repo_path: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
}

export interface Task {
  id: string;
  job_id: string;
  task_index: number;
  status: TaskStatus;
  task_spec: Record<string, unknown>;
  claimed_by: string | null;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  progress_percent: number;
  timeout_seconds: number;
  retry_count: number;
  max_retries: number;
  created_at: string;
}

export interface JobEvent {
  id: number;
  job_id: string;
  event_type: string;
  agent_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface JobApproval {
  id: number;
  job_id: string;
  agent_id: string;
  created_at: string;
}

export interface TaskProgressEntry {
  id: number;
  task_id: string;
  agent_id: string;
  progress_percent: number;
  message: string | null;
  reported_at: string;
}

export interface TaskHistoryEntry {
  id: number;
  task_id: string;
  event_type: string;
  agent_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

// ===== Request/Response Types =====

export interface RegisterAgentRequest {
  name: string;
  version?: string;
  capabilities?: Record<string, unknown>;
}

export interface CreateJobRequest {
  name: string;
  description?: string;
  job_spec: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ApproveJobRequest {
  agent_id: string;
}

export interface ClaimTaskRequest {
  agent_id: string;
}

export interface StartTaskRequest {
  agent_id: string;
}

export interface ReportProgressRequest {
  agent_id: string;
  progress_percent: number;
  message?: string;
}

export interface CompleteTaskRequest {
  agent_id: string;
  result: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface FailTaskRequest {
  agent_id: string;
  error_message: string;
  error_details?: Record<string, unknown>;
  should_retry?: boolean;
}

export interface HeartbeatRequest {
  status?: 'online' | 'offline';
}

// ===== API Response Wrapper =====

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
