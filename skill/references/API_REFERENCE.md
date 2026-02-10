# Agora - REST API Reference

**Version:** 1.0.0
**Last Updated:** 2026-02-10

---

## Table of Contents

1. [Overview](#overview)
2. [Response Format](#response-format)
3. [Error Handling](#error-handling)
4. [Agent Endpoints](#agent-endpoints)
5. [Job Endpoints](#job-endpoints)
6. [Task Endpoints](#task-endpoints)
7. [Admin & Health Endpoints](#admin--health-endpoints)
8. [Data Models](#data-models)

---

## Overview

The Agora API provides a RESTful interface for managing distributed job execution across multiple agents. The API follows standard HTTP conventions and returns JSON responses.

**Base URL:** `/api`

**Authentication:** Currently no authentication layer. Production deployments should add authentication middleware.

---

## Response Format

All API responses follow a consistent envelope format:

```json
{
  "success": true,
  "data": {
    // Response-specific data
  },
  "error": null
}
```

On error:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

---

## Error Handling

### Standard HTTP Status Codes

| Code | Error Type | Description |
|------|-----------|-------------|
| 400 | VALIDATION_ERROR | Invalid request data or parameters |
| 403 | FORBIDDEN | Agent does not have permission to access/modify this resource |
| 404 | NOT_FOUND | Resource does not exist |
| 409 | CONFLICT | Task status prevents the requested operation |
| 410 | TASK_EXPIRED | Task timeout has been exceeded |
| 500 | INTERNAL_ERROR | Server error during processing |

### Error Response Example

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "TASK_EXPIRED",
    "message": "Task timeout exceeded. Maximum allowed: 3600 seconds"
  }
}
```

---

## Agent Endpoints

### 1. Register Agent

Register a new agent with Agora.

**Endpoint:** `POST /api/agents/register`
**Status Code:** 201 Created

#### Request

```json
{
  "name": "string (required)",
  "version": "string (optional)",
  "capabilities": {
    "key": "value"
  }
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Worker-1",
    "version": "1.0.0",
    "capabilities": {
      "gpu": true,
      "max_parallel_tasks": 4
    }
  }'
```

#### Response (201 Created)

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Worker-1",
    "status": "registered",
    "version": "1.0.0",
    "capabilities": {
      "gpu": true,
      "max_parallel_tasks": 4
    },
    "registered_at": "2026-02-10T10:30:00Z",
    "last_heartbeat": null,
    "heartbeat_interval_ms": 30000
  },
  "error": null
}
```

#### Possible Errors

- **VALIDATION_ERROR** (400) — Missing required `name` field
- **INTERNAL_ERROR** (500) — Database insertion failed

---

### 2. Agent Heartbeat

Send a heartbeat signal to keep the agent marked as online.

**Endpoint:** `POST /api/agents/:id/heartbeat`
**Status Code:** 200 OK

#### Request

```json
{
  "status": "online | offline"
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/agents/550e8400-e29b-41d4-a716-446655440000/heartbeat \
  -H "Content-Type: application/json" \
  -d '{
    "status": "online"
  }'
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "acknowledged_at": "2026-02-10T10:30:15Z"
  },
  "error": null
}
```

#### Possible Errors

- **NOT_FOUND** (404) — Agent ID not found
- **VALIDATION_ERROR** (400) — Invalid status value
- **INTERNAL_ERROR** (500) — Database update failed

---

### 3. List All Agents

Retrieve a list of all registered agents with optional filtering.

**Endpoint:** `GET /api/agents`
**Status Code:** 200 OK

#### Query Parameters

| Parameter | Type | Values | Description |
|-----------|------|--------|-------------|
| status | string | `online`, `offline`, `registered` | Filter agents by status (optional) |

**cURL Example:**

```bash
curl http://localhost:3000/api/agents?status=online
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Worker-1",
      "status": "online",
      "version": "1.0.0",
      "capabilities": {
        "gpu": true,
        "max_parallel_tasks": 4
      },
      "registered_at": "2026-02-10T10:30:00Z",
      "last_heartbeat": "2026-02-10T10:30:15Z",
      "heartbeat_interval_ms": 30000
    },
    {
      "id": "660f9511-f30c-52e5-b827-557766551111",
      "name": "Worker-2",
      "status": "online",
      "version": "1.0.1",
      "capabilities": {},
      "registered_at": "2026-02-10T10:25:00Z",
      "last_heartbeat": "2026-02-10T10:30:10Z",
      "heartbeat_interval_ms": 30000
    }
  ],
  "error": null
}
```

#### Possible Errors

- **VALIDATION_ERROR** (400) — Invalid status filter value

---

### 4. Get Agent Details

Retrieve details for a specific agent.

**Endpoint:** `GET /api/agents/:id`
**Status Code:** 200 OK

**cURL Example:**

```bash
curl http://localhost:3000/api/agents/550e8400-e29b-41d4-a716-446655440000
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Worker-1",
    "status": "online",
    "version": "1.0.0",
    "capabilities": {
      "gpu": true,
      "max_parallel_tasks": 4
    },
    "registered_at": "2026-02-10T10:30:00Z",
    "last_heartbeat": "2026-02-10T10:30:15Z",
    "heartbeat_interval_ms": 30000
  },
  "error": null
}
```

#### Possible Errors

- **NOT_FOUND** (404) — Agent ID not found

---

## Job Endpoints

### 5. Create Job

Create a new job with task specifications.

**Endpoint:** `POST /api/jobs`
**Status Code:** 201 Created

#### Request

```json
{
  "name": "string (required)",
  "description": "string (optional)",
  "task_specs": [
    {
      "specification": {} ,
      "timeout_seconds": 3600,
      "max_retries": 3
    }
  ],
  "metadata": {
    "key": "value"
  }
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DataProcessingJob-001",
    "description": "Process customer data files",
    "task_specs": [
      {
        "specification": {
          "input_file": "customers.csv",
          "operation": "validate"
        },
        "timeout_seconds": 3600,
        "max_retries": 3
      },
      {
        "specification": {
          "input_file": "customers.csv",
          "operation": "transform"
        },
        "timeout_seconds": 7200,
        "max_retries": 2
      }
    ],
    "metadata": {
      "priority": "high",
      "team": "data-eng"
    }
  }'
```

#### Response (201 Created)

```json
{
  "success": true,
  "data": {
    "id": "770g0622-g40d-63f6-c938-668877662222",
    "name": "DataProcessingJob-001",
    "description": "Process customer data files",
    "status": "ready",
    "total_tasks": 2,
    "completed_tasks": 0,
    "failed_tasks": 0,
    "job_spec": [
      {
        "specification": {
          "input_file": "customers.csv",
          "operation": "validate"
        },
        "timeout_seconds": 3600,
        "max_retries": 3
      },
      {
        "specification": {
          "input_file": "customers.csv",
          "operation": "transform"
        },
        "timeout_seconds": 7200,
        "max_retries": 2
      }
    ],
    "git_repo_path": "/var/jobs/770g0622-g40d-63f6-c938-668877662222",
    "created_at": "2026-02-10T10:35:00Z",
    "started_at": null,
    "completed_at": null,
    "metadata": {
      "priority": "high",
      "team": "data-eng"
    }
  },
  "error": null
}
```

#### Possible Errors

- **VALIDATION_ERROR** (400) — Missing required fields or invalid task_specs
- **INTERNAL_ERROR** (500) — Database or file system error

---

### 6. List All Jobs

Retrieve a list of all jobs with optional status filtering.

**Endpoint:** `GET /api/jobs`
**Status Code:** 200 OK

#### Query Parameters

| Parameter | Type | Values | Description |
|-----------|------|--------|-------------|
| status | string | `created`, `splitting`, `ready`, `in_progress`, `completed`, `failed` | Filter jobs by status (optional) |

**cURL Example:**

```bash
curl http://localhost:3000/api/jobs?status=in_progress
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "770g0622-g40d-63f6-c938-668877662222",
      "name": "DataProcessingJob-001",
      "description": "Process customer data files",
      "status": "in_progress",
      "total_tasks": 2,
      "completed_tasks": 1,
      "failed_tasks": 0,
      "job_spec": [...],
      "git_repo_path": "/var/jobs/770g0622-g40d-63f6-c938-668877662222",
      "created_at": "2026-02-10T10:35:00Z",
      "started_at": "2026-02-10T10:36:00Z",
      "completed_at": null,
      "metadata": {}
    }
  ],
  "error": null
}
```

#### Possible Errors

- **VALIDATION_ERROR** (400) — Invalid status filter value

---

### 7. Get Job Details

Retrieve details for a specific job including computed progress.

**Endpoint:** `GET /api/jobs/:id`
**Status Code:** 200 OK

**cURL Example:**

```bash
curl http://localhost:3000/api/jobs/770g0622-g40d-63f6-c938-668877662222
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "770g0622-g40d-63f6-c938-668877662222",
    "name": "DataProcessingJob-001",
    "description": "Process customer data files",
    "status": "in_progress",
    "total_tasks": 2,
    "completed_tasks": 1,
    "failed_tasks": 0,
    "job_spec": [...],
    "git_repo_path": "/var/jobs/770g0622-g40d-63f6-c938-668877662222",
    "created_at": "2026-02-10T10:35:00Z",
    "started_at": "2026-02-10T10:36:00Z",
    "completed_at": null,
    "metadata": {},
    "progress_percent": 50
  },
  "error": null
}
```

#### Possible Errors

- **NOT_FOUND** (404) — Job ID not found

---

### 8. Get Job Tasks

Retrieve all tasks for a specific job, ordered by task index.

**Endpoint:** `GET /api/jobs/:id/tasks`
**Status Code:** 200 OK

**cURL Example:**

```bash
curl http://localhost:3000/api/jobs/770g0622-g40d-63f6-c938-668877662222/tasks
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "880h1733-h51e-74g7-d049-779988773333",
      "job_id": "770g0622-g40d-63f6-c938-668877662222",
      "task_index": 0,
      "status": "completed",
      "task_spec": {
        "specification": {
          "input_file": "customers.csv",
          "operation": "validate"
        },
        "timeout_seconds": 3600,
        "max_retries": 3
      },
      "claimed_by": "550e8400-e29b-41d4-a716-446655440000",
      "assigned_at": "2026-02-10T10:36:30Z",
      "started_at": "2026-02-10T10:36:35Z",
      "completed_at": "2026-02-10T10:37:15Z",
      "result": {
        "validated_records": 10000,
        "errors": 5
      },
      "error_message": null,
      "progress_percent": 100,
      "timeout_seconds": 3600,
      "retry_count": 0,
      "max_retries": 3,
      "created_at": "2026-02-10T10:35:05Z"
    },
    {
      "id": "990i2844-i62f-85h8-e150-880099884444",
      "job_id": "770g0622-g40d-63f6-c938-668877662222",
      "task_index": 1,
      "status": "in_progress",
      "task_spec": {
        "specification": {
          "input_file": "customers.csv",
          "operation": "transform"
        },
        "timeout_seconds": 7200,
        "max_retries": 2
      },
      "claimed_by": "660f9511-f30c-52e5-b827-557766551111",
      "assigned_at": "2026-02-10T10:37:30Z",
      "started_at": "2026-02-10T10:37:35Z",
      "completed_at": null,
      "result": null,
      "error_message": null,
      "progress_percent": 45,
      "timeout_seconds": 7200,
      "retry_count": 0,
      "max_retries": 2,
      "created_at": "2026-02-10T10:35:10Z"
    }
  ],
  "error": null
}
```

#### Possible Errors

- **NOT_FOUND** (404) — Job ID not found

---

## Task Endpoints

### 9. Claim Task

Claim an available task for processing.

**Endpoint:** `POST /api/tasks/claim`
**Status Code:** 200 OK

#### Request

```json
{
  "agent_id": "uuid (required)"
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/tasks/claim \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

#### Response (200 OK) - Task Available

```json
{
  "success": true,
  "data": {
    "task": {
      "id": "990i2844-i62f-85h8-e150-880099884444",
      "job_id": "770g0622-g40d-63f6-c938-668877662222",
      "task_index": 1,
      "status": "assigned",
      "task_spec": {
        "specification": {
          "input_file": "customers.csv",
          "operation": "transform"
        },
        "timeout_seconds": 7200,
        "max_retries": 2
      },
      "claimed_by": "550e8400-e29b-41d4-a716-446655440000",
      "assigned_at": "2026-02-10T10:37:30Z",
      "started_at": null,
      "completed_at": null,
      "result": null,
      "error_message": null,
      "progress_percent": 0,
      "timeout_seconds": 7200,
      "retry_count": 0,
      "max_retries": 2,
      "created_at": "2026-02-10T10:35:10Z"
    }
  },
  "error": null
}
```

#### Response (200 OK) - No Tasks Available

```json
{
  "success": true,
  "data": {
    "task": null,
    "message": "No tasks available"
  },
  "error": null
}
```

#### Possible Errors

- **NOT_FOUND** (404) — Agent ID not found
- **INTERNAL_ERROR** (500) — Database error

---

### 10. Start Task

Mark a claimed task as started.

**Endpoint:** `POST /api/tasks/:id/start`
**Status Code:** 200 OK

#### Request

```json
{
  "agent_id": "uuid (required)"
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/tasks/990i2844-i62f-85h8-e150-880099884444/start \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "990i2844-i62f-85h8-e150-880099884444",
    "job_id": "770g0622-g40d-63f6-c938-668877662222",
    "task_index": 1,
    "status": "in_progress",
    "task_spec": {...},
    "claimed_by": "550e8400-e29b-41d4-a716-446655440000",
    "assigned_at": "2026-02-10T10:37:30Z",
    "started_at": "2026-02-10T10:37:35Z",
    "completed_at": null,
    "result": null,
    "error_message": null,
    "progress_percent": 0,
    "timeout_seconds": 7200,
    "retry_count": 0,
    "max_retries": 2,
    "created_at": "2026-02-10T10:35:10Z"
  },
  "error": null
}
```

#### Possible Errors

- **NOT_FOUND** (404) — Task ID not found
- **FORBIDDEN** (403) — Task not claimed by this agent
- **CONFLICT** (409) — Task not in "assigned" status
- **TASK_EXPIRED** (410) — Task timeout exceeded

---

### 11. Update Task Progress

Send progress updates for an in-progress task.

**Endpoint:** `POST /api/tasks/:id/progress`
**Status Code:** 200 OK

#### Request

```json
{
  "agent_id": "uuid (required)",
  "progress_percent": 0-100 (required),
  "message": "string (optional)"
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/tasks/990i2844-i62f-85h8-e150-880099884444/progress \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "550e8400-e29b-41d4-a716-446655440000",
    "progress_percent": 45,
    "message": "Processed 4500 records"
  }'
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "acknowledged_at": "2026-02-10T10:38:00Z"
  },
  "error": null
}
```

#### Possible Errors

- **NOT_FOUND** (404) — Task ID not found
- **FORBIDDEN** (403) — Task not claimed by this agent
- **CONFLICT** (409) — Task not in "in_progress" status
- **TASK_EXPIRED** (410) — Task timeout exceeded
- **VALIDATION_ERROR** (400) — Invalid progress_percent value

---

### 12. Complete Task

Mark a task as completed with results.

**Endpoint:** `POST /api/tasks/:id/complete`
**Status Code:** 200 OK

#### Request

```json
{
  "agent_id": "uuid (required)",
  "result": {
    "key": "value"
  }
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/tasks/990i2844-i62f-85h8-e150-880099884444/complete \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "550e8400-e29b-41d4-a716-446655440000",
    "result": {
      "transformed_records": 10000,
      "output_file": "transformed_customers.csv",
      "duration_seconds": 125
    }
  }'
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "990i2844-i62f-85h8-e150-880099884444",
    "job_id": "770g0622-g40d-63f6-c938-668877662222",
    "task_index": 1,
    "status": "completed",
    "task_spec": {...},
    "claimed_by": "550e8400-e29b-41d4-a716-446655440000",
    "assigned_at": "2026-02-10T10:37:30Z",
    "started_at": "2026-02-10T10:37:35Z",
    "completed_at": "2026-02-10T10:39:40Z",
    "result": {
      "transformed_records": 10000,
      "output_file": "transformed_customers.csv",
      "duration_seconds": 125
    },
    "error_message": null,
    "progress_percent": 100,
    "timeout_seconds": 7200,
    "retry_count": 0,
    "max_retries": 2,
    "created_at": "2026-02-10T10:35:10Z"
  },
  "error": null
}
```

#### Possible Errors

- **NOT_FOUND** (404) — Task ID not found
- **FORBIDDEN** (403) — Task not claimed by this agent
- **CONFLICT** (409) — Task not in "in_progress" status
- **TASK_EXPIRED** (410) — Task timeout exceeded

---

### 13. Fail Task

Mark a task as failed with error details.

**Endpoint:** `POST /api/tasks/:id/fail`
**Status Code:** 200 OK

#### Request

```json
{
  "agent_id": "uuid (required)",
  "error_message": "string (required)",
  "should_retry": true|false
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/tasks/990i2844-i62f-85h8-e150-880099884444/fail \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "550e8400-e29b-41d4-a716-446655440000",
    "error_message": "Database connection timeout",
    "should_retry": true
  }'
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "will_retry": true
  },
  "error": null
}
```

#### Response (200 OK) - No Retry

```json
{
  "success": true,
  "data": {
    "will_retry": false
  },
  "error": null
}
```

**Note:** When `will_retry` is true, the task status is reset to "pending" with an incremented `retry_count`. When `will_retry` is false, the task status is set to "failed".

#### Possible Errors

- **NOT_FOUND** (404) — Task ID not found
- **FORBIDDEN** (403) — Task not claimed by this agent
- **CONFLICT** (409) — Task not in "in_progress" status
- **TASK_EXPIRED** (410) — Task timeout exceeded
- **VALIDATION_ERROR** (400) — Missing error_message field

---

### 14. Get Task Details

Retrieve full details for a specific task.

**Endpoint:** `GET /api/tasks/:id`
**Status Code:** 200 OK

**cURL Example:**

```bash
curl http://localhost:3000/api/tasks/990i2844-i62f-85h8-e150-880099884444
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "990i2844-i62f-85h8-e150-880099884444",
    "job_id": "770g0622-g40d-63f6-c938-668877662222",
    "task_index": 1,
    "status": "completed",
    "task_spec": {
      "specification": {
        "input_file": "customers.csv",
        "operation": "transform"
      },
      "timeout_seconds": 7200,
      "max_retries": 2
    },
    "claimed_by": "550e8400-e29b-41d4-a716-446655440000",
    "assigned_at": "2026-02-10T10:37:30Z",
    "started_at": "2026-02-10T10:37:35Z",
    "completed_at": "2026-02-10T10:39:40Z",
    "result": {
      "transformed_records": 10000,
      "output_file": "transformed_customers.csv",
      "duration_seconds": 125
    },
    "error_message": null,
    "progress_percent": 100,
    "timeout_seconds": 7200,
    "retry_count": 0,
    "max_retries": 2,
    "created_at": "2026-02-10T10:35:10Z"
  },
  "error": null
}
```

#### Possible Errors

- **NOT_FOUND** (404) — Task ID not found

---

## Admin & Health Endpoints

### 15. Health Check

Check the overall health of the API and its dependencies.

**Endpoint:** `GET /api/health`
**Status Code:** 200 OK

**cURL Example:**

```bash
curl http://localhost:3000/api/health
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-10T10:40:00Z",
    "version": "1.0.0",
    "database": {
      "connected": true,
      "response_time_ms": 5
    }
  },
  "error": null
}
```

#### Response (503 Service Unavailable)

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Database connection failed"
  }
}
```

---

### 16. System Statistics

Retrieve aggregate statistics about agents, jobs, and tasks.

**Endpoint:** `GET /api/stats`
**Status Code:** 200 OK

**cURL Example:**

```bash
curl http://localhost:3000/api/stats
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "agents": {
      "total": 5,
      "online": 4,
      "offline": 1
    },
    "jobs": {
      "total": 12,
      "by_status": {
        "created": 0,
        "splitting": 0,
        "ready": 3,
        "in_progress": 4,
        "completed": 4,
        "failed": 1
      }
    },
    "tasks": {
      "total": 47,
      "by_status": {
        "pending": 8,
        "assigned": 2,
        "in_progress": 5,
        "completed": 30,
        "failed": 2
      }
    }
  },
  "error": null
}
```

#### Possible Errors

- **INTERNAL_ERROR** (500) — Database error during aggregation

---

## Data Models

### Agent Object

```json
{
  "id": "uuid",
  "name": "string",
  "status": "registered|online|offline",
  "version": "string",
  "capabilities": {
    "key": "value"
  },
  "registered_at": "ISO8601 timestamp",
  "last_heartbeat": "ISO8601 timestamp | null",
  "heartbeat_interval_ms": 30000
}
```

### Job Object

```json
{
  "id": "uuid",
  "name": "string",
  "description": "string",
  "status": "created|splitting|ready|in_progress|completed|failed",
  "total_tasks": "integer",
  "completed_tasks": "integer",
  "failed_tasks": "integer",
  "job_spec": [
    {
      "specification": {},
      "timeout_seconds": "integer",
      "max_retries": "integer"
    }
  ],
  "git_repo_path": "string",
  "created_at": "ISO8601 timestamp",
  "started_at": "ISO8601 timestamp | null",
  "completed_at": "ISO8601 timestamp | null",
  "metadata": {},
  "progress_percent": "integer (computed, 0-100)"
}
```

### Task Object

```json
{
  "id": "uuid",
  "job_id": "uuid",
  "task_index": "integer",
  "status": "pending|assigned|in_progress|completed|failed",
  "task_spec": {
    "specification": {},
    "timeout_seconds": "integer",
    "max_retries": "integer"
  },
  "claimed_by": "uuid | null",
  "assigned_at": "ISO8601 timestamp | null",
  "started_at": "ISO8601 timestamp | null",
  "completed_at": "ISO8601 timestamp | null",
  "result": "JSON | null",
  "error_message": "string | null",
  "progress_percent": "integer (0-100)",
  "timeout_seconds": "integer",
  "retry_count": "integer",
  "max_retries": "integer",
  "created_at": "ISO8601 timestamp"
}
```

---

## Best Practices

### Heartbeat Strategy

Agents should send heartbeat signals at regular intervals (default: 30 seconds) to remain marked as "online". Missing multiple heartbeat intervals will result in the agent being marked as "offline".

### Task Timeout Handling

Each task has a `timeout_seconds` value. If a task exceeds this timeout without being completed, the API will mark it as expired. Clients should check for `TASK_EXPIRED` errors and handle accordingly.

### Retry Logic

When a task fails:
- If `should_retry` is true and `retry_count < max_retries`, the task returns to "pending" status
- If `retry_count >= max_retries` or `should_retry` is false, the task is marked as "failed"
- Clients should implement exponential backoff when claiming failed tasks

### Progress Updates

Send progress updates regularly to prevent task timeouts. Progress updates are acknowledged but do not require the agent to wait for a response.

### Error Recovery

When receiving a `FORBIDDEN` (403) or `CONFLICT` (409) error, clients should claim a new task rather than retry on the same task. The task may have been reassigned or changed state.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-10 | Initial API release |
