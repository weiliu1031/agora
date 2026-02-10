---
name: agora
description: |
  **Agora Client**: Connect to an Agora server to claim and execute distributed tasks.
  MANDATORY TRIGGERS: agora, job center, claim task, distributed task, task queue, agent registration
---

# Agora Skill

## Overview

The Agora skill enables Claude to connect to a distributed task execution system. The system architecture consists of:

- **Agora Server**: A REST API coordinator that manages a queue of jobs and tasks
- **Agents**: Claude instances (like this one) that register with Agora, claim individual tasks, execute them, and report results
- **Jobs**: Logical units of work submitted by coordinators, split into multiple tasks
- **Tasks**: Individual work units that agents claim and execute sequentially

When you invoke this skill, Claude will:
1. Register with Agora server
2. Claim available tasks from the queue
3. Execute each task using Claude's capabilities (code execution, file analysis, web search, etc.)
4. Report results back to Agora
5. Continue claiming and executing tasks until the queue is empty

For complete API endpoint documentation, see `references/API_REFERENCE.md`.

The skill uses `curl` for all HTTP communication with Agora — no additional dependencies are required beyond a standard Unix environment.

---

## Configuration

The Agora configuration is stored in `~/.agora/config.json` and contains the base URL of the Agora server.

### First-Time Setup

On the first invocation, you must configure Agora URL:

1. **Check if configured:**
   ```bash
   bash SKILL_DIR/scripts/ajc-config.sh get-url
   ```
   Replace `SKILL_DIR` with the actual directory path of this skill.
   If the command exits with code 0, configuration exists. If it exits with code 1, proceed to step 2.

2. **Prompt user and set URL:**
   - Ask the user: "What is the Agora server URL? (e.g., http://localhost:3000)"
   - User provides the URL
   - Run the config script to save and validate:
     ```bash
     bash SKILL_DIR/scripts/ajc-config.sh set-url <url>
     ```
   - Replace `<url>` with the user-provided URL and `SKILL_DIR` with the actual skill directory path

3. **Handle validation failures:**
   - If the script reports "Connection failed" or similar, Agora server may not be running
   - Inform the user: "The Agora server at that URL is not responding. Make sure the server is running. To start it locally: `cd ~/Code/agora && npm run dev`"

### Subsequent Invocations

For all subsequent invocations in the same session:

1. **Retrieve the base URL silently:**
   ```bash
   BASE_URL=$(bash SKILL_DIR/scripts/ajc-config.sh get-url)
   ```
   Replace `SKILL_DIR` with the actual skill directory path.

2. **Store in a session variable:**
   Keep `BASE_URL` available for all subsequent curl commands in this skill invocation.

3. **If retrieval fails:**
   Exit gracefully and ask the user to reconfigure: "Configuration not found. Please re-run the skill to set up the Agora URL."

---

## Agent Registration

ALWAYS register with Agora before performing any other operations. Registration identifies this Claude instance to the server.

### Registration Request

Execute this curl command:

```bash
HOSTNAME=$(hostname)
curl -s -X POST "${BASE_URL}/api/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"claude-agent-'${HOSTNAME}'","version":"1.0.0","capabilities":{}}'
```

This creates a unique agent identity using the machine hostname. You may substitute a custom agent name if desired (e.g., "claude-agent-task-executor").

### Parse the Response

The server returns a JSON object like:
```json
{
  "success": true,
  "data": {
    "id": "agent-uuid-12345",
    "name": "claude-agent-hostname",
    "status": "online",
    "registered_at": "2025-02-10T12:00:00Z"
  }
}
```

**Extract the agent ID** from `data.id`. Store it in a variable:
```bash
AGENT_ID="agent-uuid-12345"
```

Use `AGENT_ID` in all subsequent API calls throughout this session.

### Cleanup on Session End

Before the skill terminates, register the agent as offline:

```bash
curl -s -X POST "${BASE_URL}/api/agents/${AGENT_ID}/heartbeat" \
  -H "Content-Type: application/json" \
  -d '{"status":"offline"}'
```

This allows Agora to mark the agent as no longer available and reassign any incomplete tasks.

---

## Core Workflow: Claim → Execute → Report

The main workflow consists of six steps that repeat until all tasks are claimed and executed.

### Step 1: Claim a Task

Request the next available task from the queue:

```bash
curl -s -X POST "${BASE_URL}/api/tasks/claim" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"'${AGENT_ID}'"}'
```

**Parse the response:**
- If `data.task` is `null`, there are no available tasks. Inform the user: "All available tasks have been claimed or the queue is empty. No more work to do."
- If `data.task` exists, extract these fields:
  - `task.id` → store as `TASK_ID`
  - `task.task_spec` → the specification of what to do (JSON object with `operation` and other fields)
  - `task.timeout_seconds` → how long you have to complete it
  - `task.job_id` → the parent job identifier (for reference)

### Step 2: Start the Task

Notify Agora that you are beginning execution:

```bash
curl -s -X POST "${BASE_URL}/api/tasks/${TASK_ID}/start" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"'${AGENT_ID}'"}'
```

The task now transitions from `claimed` to `in_progress` status. Only this agent can complete or fail the task while it's in progress.

### Step 3: Execute the Task

Examine the `task_spec` and perform the required work.

The `task_spec` is a JSON object containing:
- `operation`: A string identifying the type of work (e.g., "analyze", "process", "generate", "fetch")
- Additional fields specific to the operation (e.g., `file`, `input`, `parameters`)

Use Claude's full capabilities to execute the task:
- Run code or scripts
- Analyze and read files
- Perform web searches
- Manipulate data
- Generate content
- Anything else needed to complete the task

Work within the `timeout_seconds` limit. For long-running tasks, use Step 4 to report progress.

### Step 4: Report Progress (Optional but Recommended)

For long-running tasks, periodically report progress to keep Agora updated:

```bash
curl -s -X POST "${BASE_URL}/api/tasks/${TASK_ID}/progress" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"'${AGENT_ID}'","progress_percent":50,"message":"Processing file chunk 2 of 4..."}'
```

Fields:
- `progress_percent`: Integer from 0-100 indicating completion
- `message`: Optional human-readable status message

This prevents Agora from thinking the agent has stalled.

### Step 5a: Complete the Task (Success)

When the task execution succeeds, submit the result:

```bash
curl -s -X POST "${BASE_URL}/api/tasks/${TASK_ID}/complete" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"'${AGENT_ID}'","result":{...}}'
```

The `result` field must be a JSON object containing the output:
- Include computed values, data, file paths, or summaries
- Structure the result to match what the task requested
- Example for an "analyze" operation: `{"summary":"Key findings...","metrics":{...},"confidence":0.95}`

The task transitions to `completed` and is removed from the queue.

### Step 5b: Fail the Task (Error)

If the task execution fails, report the failure:

```bash
curl -s -X POST "${BASE_URL}/api/tasks/${TASK_ID}/fail" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"'${AGENT_ID}'","error_message":"File not found: input.txt","should_retry":false}'
```

Fields:
- `error_message`: Description of what went wrong
- `should_retry`: Boolean indicating whether Agora should retry this task
  - `true` for transient errors (network timeout, temporary file lock, rate limiting)
  - `false` for permanent errors (invalid task spec, missing resource, logic error)

The response includes `will_retry` boolean. If `true`, the task re-enters the queue for retry.

### Step 6: Loop

After completing or failing a task, go back to Step 1 to claim the next task. Repeat until `data.task` is `null`, indicating the queue is empty.

---

## Querying Status

You can check the status of jobs and tasks without claiming new work:

**Check job progress:**
```bash
curl -s "${BASE_URL}/api/jobs/${JOB_ID}"
```
Returns: job details including `progress_percent`, `completed_tasks`, `total_tasks`, `status`

**List all jobs:**
```bash
curl -s "${BASE_URL}/api/jobs"
```
Returns: array of all job objects in the system

**Check a specific task:**
```bash
curl -s "${BASE_URL}/api/tasks/${TASK_ID}"
```
Returns: full task object including status, spec, agent assignment

**List tasks for a job:**
```bash
curl -s "${BASE_URL}/api/jobs/${JOB_ID}/tasks"
```
Returns: array of all tasks belonging to the job

**System statistics:**
```bash
curl -s "${BASE_URL}/api/stats"
```
Returns: aggregate counts of agents, jobs, tasks, and their statuses

**Web dashboard:**
Open `${BASE_URL}` in a web browser to access an interactive dashboard showing all jobs, tasks, agents, and real-time metrics.

---

## Job Submission (For Orchestrators)

If Claude needs to create a new job and distribute it as tasks (rather than only executing tasks), use this endpoint:

```bash
curl -s -X POST "${BASE_URL}/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Batch Processing Job",
    "description": "Process and analyze 10 input files",
    "task_specs": [
      {
        "specification": {"operation": "analyze", "input": "file1.txt", "format": "json"},
        "timeout_seconds": 3600,
        "max_retries": 3
      },
      {
        "specification": {"operation": "analyze", "input": "file2.txt", "format": "json"},
        "timeout_seconds": 3600,
        "max_retries": 3
      }
    ]
  }'
```

**Fields:**
- `name`: Human-readable job name
- `description`: Optional job description
- `task_specs`: Array of task objects
  - Each task has `specification` (the actual work definition as JSON)
  - Optional `timeout_seconds` (default: 3600 seconds / 1 hour)
  - Optional `max_retries` (default: 3)

The response includes `data.job.id` — the newly created job ID. You can then monitor its progress using the query endpoints.

---

## Error Handling

Agora returns HTTP status codes and error responses. Handle these cases:

**Connection Refused (ECONNREFUSED):**
- Agora server is not running
- Inform user: "Cannot connect to Agora at ${BASE_URL}. Make sure the server is running: `cd ~/Code/agora && npm run dev`"

**404 NOT_FOUND:**
- Requested task or job does not exist
- Check the ID is correct; verify the resource hasn't been deleted

**409 CONFLICT:**
- Task is in wrong state for the operation (e.g., trying to complete a task that's not in_progress)
- Check current task status first: `curl -s "${BASE_URL}/api/tasks/${TASK_ID}"`

**403 FORBIDDEN:**
- Attempting to operate on a task not claimed by this agent
- Only the agent that claimed a task can start, complete, or fail it
- Claim a different task instead

**410 TASK_EXPIRED:**
- Task timed out while in progress
- Agora has reassigned it. Do not attempt to complete it.
- Claim the next available task

**500 INTERNAL_ERROR:**
- Server-side error
- Log the error message
- Optionally retry once
- Report to user: "Agora encountered an error. Contact the administrator with error details."

---

## Example: Full Session

Here is a complete worked example of a typical Agora session:

**1. Configure the server URL (first time only):**
```bash
bash ~/Code/agora/skill/scripts/ajc-config.sh set-url http://localhost:3000
```
Server validates and stores the URL.

**2. Register as an agent:**
```bash
curl -s -X POST "http://localhost:3000/api/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"claude-agent-executor","version":"1.0.0","capabilities":{}}'
```
Response: `{"data":{"id":"agent-abc123",...}}`
Save: `AGENT_ID="agent-abc123"`

**3. Claim the first task:**
```bash
curl -s -X POST "http://localhost:3000/api/tasks/claim" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"agent-abc123"}'
```
Response includes: `task.id="task-001"`, `task.task_spec={"operation":"analyze","file":"report.pdf","output_format":"json"}`

**4. Start the task:**
```bash
curl -s -X POST "http://localhost:3000/api/tasks/task-001/start" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"agent-abc123"}'
```

**5. Execute the task:**
Claude reads the PDF file `report.pdf`, extracts key information, and prepares analysis.

**6. Report progress:**
```bash
curl -s -X POST "http://localhost:3000/api/tasks/task-001/progress" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"agent-abc123","progress_percent":50,"message":"Extracted text from pages 1-5"}'
```

**7. Complete the task with results:**
```bash
curl -s -X POST "http://localhost:3000/api/tasks/task-001/complete" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"agent-abc123","result":{"summary":"Report contains quarterly financial data...","pages_analyzed":15,"key_metrics":{"revenue":1000000,"growth":0.15}}}'
```

**8. Claim the next task:**
```bash
curl -s -X POST "http://localhost:3000/api/tasks/claim" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"agent-abc123"}'
```
Response: `{"data":{"task":null}}` — no more tasks available.

**9. Unregister on session end:**
```bash
curl -s -X POST "http://localhost:3000/api/agents/agent-abc123/heartbeat" \
  -H "Content-Type: application/json" \
  -d '{"status":"offline"}'
```

Session complete. All tasks executed and results submitted.
