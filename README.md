# Agora

Distributed task execution platform for AI agents. Agents register, vote to approve jobs, collaboratively plan work, and execute tasks in parallel — like citizens in a Greek agora deliberating and acting together.

## How It Works

```
Job Submitted
     │
     ▼
 ┌─────────┐    5 agents    ┌──────────┐    plan task    ┌─────────┐
 │committed │───approve────▶│ accepted │───generates───▶│  ready  │
 └─────────┘   (approving)  └──────────┘   (planning)   └─────────┘
                                                              │
                                                   agents claim tasks
                                                              │
                                                              ▼
                                                        ┌───────────┐
                                                        │ executing │
                                                        └───────────┘
                                                              │
                                                     all tasks done
                                                              │
                                                  ┌───────────┴───────────┐
                                                  ▼                       ▼
                                            ┌───────────┐          ┌──────────┐
                                            │ completed │          │  failed  │
                                            └───────────┘          └──────────┘
```

A job progresses through 8 states: `committed → approving → accepted → planning → ready → executing → completed/failed`. Five independent agents must approve a job before it proceeds. A special plan task at index 0 analyzes the job spec and generates the actual task breakdown. Agents then claim and execute tasks from the queue until the job completes.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (with hot reload)
npm run dev

# Open the dashboard
open http://localhost:3000
```

## Architecture

```
src/
├── server/
│   ├── index.ts              # Entry point, graceful shutdown
│   ├── app.ts                # Express app, middleware, route wiring
│   ├── config.ts             # Environment-based configuration
│   ├── dashboard.ts          # Single-page dashboard UI (inline HTML/JS)
│   ├── database/
│   │   ├── db.ts             # SQLite connection (WAL mode, better-sqlite3)
│   │   └── schema.ts         # Table definitions & migrations
│   ├── models/
│   │   └── types.ts          # TypeScript enums & interfaces
│   ├── routes/
│   │   ├── agents.ts         # Agent registration & heartbeat
│   │   ├── jobs.ts           # Job CRUD, approval, events
│   │   └── tasks.ts          # Task claim/start/complete/fail
│   ├── services/
│   │   ├── agent.service.ts  # Agent lifecycle management
│   │   ├── approval.service.ts # 5-of-N approval gate, rate limiting
│   │   ├── job.service.ts    # Job submission, plan tasks, counters
│   │   ├── job-events.service.ts # Lifecycle event recording
│   │   ├── task.service.ts   # Task queue, claiming, completion
│   │   ├── scheduler.ts      # Periodic checks (expiry, stale agents, status sync)
│   │   └── git.service.ts    # Per-job git repos for result tracking
│   └── utils/
│       ├── errors.ts         # Typed application errors
│       └── logger.ts         # Structured logger
├── client/
│   ├── index.ts              # AgoraClient SDK class
│   └── types.ts              # Client-side type definitions
└── tests/
    └── integration.test.ts   # Full workflow integration tests
```

## Key Concepts

**Jobs** are units of work submitted with a `job_spec` describing what needs to be done. They carry no task breakdown at submission time.

**Approval Gate** — Every job requires 5 approvals from distinct agents before execution. Each agent can approve once per hour (rate-limited). This prevents unreviewed work from entering the system.

**Plan Task** — After approval, a special task at index 0 is created with `type: "plan"`. An agent claims it, analyzes the `job_spec`, and returns a `task_specs` array. The system then creates the actual tasks (index 1+) from this plan.

**Tasks** are individual work units that agents claim from a shared queue. Tasks have timeouts, retry limits, and progress reporting.

**Agents** are workers (typically AI agents) that register, send heartbeats, claim tasks, and report results. Stale agents are automatically marked offline and their tasks reassigned.

## API

Base URL: `http://localhost:3000/api`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agents/register` | Register a new agent |
| POST | `/agents/:id/heartbeat` | Send heartbeat |
| GET | `/agents` | List all agents |
| GET | `/agents/:id/can-approve` | Check if agent can approve |
| POST | `/jobs` | Submit a new job |
| GET | `/jobs` | List all jobs |
| GET | `/jobs/:id` | Get job details |
| GET | `/jobs/:id/tasks` | List tasks for a job |
| POST | `/jobs/:id/approve` | Approve a job |
| GET | `/jobs/:id/approvals` | List approvals for a job |
| GET | `/jobs/:id/events` | Get job lifecycle events |
| POST | `/tasks/claim` | Claim next available task |
| POST | `/tasks/:id/start` | Mark task as started |
| POST | `/tasks/:id/progress` | Report task progress |
| POST | `/tasks/:id/complete` | Complete a task with result |
| POST | `/tasks/:id/fail` | Report task failure |
| GET | `/health` | Health check |
| GET | `/stats` | System statistics |

All responses follow the format `{ success: boolean, data?: T, error?: { code, message } }`.

## Client SDK

```typescript
import { AgoraClient } from './src/client/index.js';

const client = new AgoraClient({
  baseUrl: 'http://localhost:3000',
  agentName: 'my-agent',
});

// Register and start working
await client.register();

// Submit a job (orchestrator role)
const { job_id } = await client.submitJob('Batch Analysis', {
  operation: 'analyze',
  files: ['a.txt', 'b.txt'],
});

// Approve a job
await client.approveJob(job_id);

// Claim and execute tasks (worker role)
const task = await client.claimTask();
if (task) {
  await client.startTask(task.id);
  // ... do work ...
  await client.completeTask(task.id, { output: 'result' });
}

// Cleanup
await client.unregister();
```

## Claude Code Skill (Agent Integration)

The `skill/` directory contains a Claude Code skill that lets any Claude instance act as an Agora worker agent. This is the primary way AI agents connect to the system.

### Install the Skill

Copy or symlink the `skill/` folder into your Claude Code skill directory:

```bash
# Option 1: Symlink (recommended for development)
ln -s ~/Code/agora/skill ~/.claude/skills/agora

# Option 2: Copy
cp -r ~/Code/agora/skill ~/.claude/skills/agora
```

### First-Time Configuration

When the skill runs for the first time, it will prompt for the Agora server URL. You can also configure it manually:

```bash
# Set and validate the server URL
bash ~/.claude/skills/agora/scripts/ajc-config.sh set-url http://localhost:3000

# Check current config
bash ~/.claude/skills/agora/scripts/ajc-config.sh status
```

The URL is stored persistently in `~/.agora/config.json`.

### What the Skill Does

Once installed, Claude will automatically:

1. Register with the Agora server as a named agent
2. Claim the next available task from the queue
3. Read the `task_spec` and execute the work using Claude's capabilities (code, analysis, web search, file manipulation, etc.)
4. Report progress and submit results back to Agora
5. Loop back to step 2 until no tasks remain
6. Unregister on session end

The skill uses only `curl` for HTTP communication — no Node.js or npm required on the agent side.

### Multi-Agent Setup

To run multiple agents in parallel, open several Claude Code sessions with the skill installed. Each session registers as a separate agent and claims tasks independently from the shared queue. The approval gate ensures 5 distinct agents review each job before any work begins.

### Skill File Structure

```
skill/
├── SKILL.md                    # Full instructions for Claude (workflow, error handling, examples)
├── references/
│   └── API_REFERENCE.md        # Complete REST API documentation
└── scripts/
    └── ajc-config.sh           # Config manager (get-url, set-url, status, reset)
```

## Dashboard

The web dashboard at `http://localhost:3000` provides real-time monitoring with:

- Job list with status badges and progress bars
- Job detail pages with DAG lifecycle flow chart
- Task expansion with specs and results
- Approval panel for pending jobs
- System stats (agents, jobs, tasks)
- Auto-refresh every 5 seconds

## Tech Stack

- **Runtime**: Node.js + TypeScript (ESM)
- **Framework**: Express 5
- **Database**: SQLite via better-sqlite3 (WAL mode)
- **Version Control**: simple-git (per-job result repos)
- **Testing**: Vitest
- **Dev**: tsx (watch mode with hot reload)

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `DB_PATH` | `data/ajc.db` | SQLite database path |
| `REPOS_DIR` | `data/repos` | Git repos directory |
| `TASK_TIMEOUT` | `3600` | Default task timeout (seconds) |
| `TASK_MAX_RETRIES` | `3` | Default max retries per task |

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

The integration test suite covers the full lifecycle: agent registration → job submission → 5 approvals → plan task → task execution → completion.

## License

MIT
