export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, 'NOT_FOUND', `${resource} '${id}' not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(403, 'FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class TaskExpiredError extends AppError {
  constructor(taskId: string) {
    super(410, 'TASK_EXPIRED', `Task '${taskId}' has expired and no longer accepts submissions`);
    this.name = 'TaskExpiredError';
  }
}
