import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/db.js';
import { Agent, AgentStatus, RegisterAgentRequest } from '../models/types.js';
import { logger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';

const SERVICE_NAME = 'AgentService';

/**
 * Parse an agent row from the database into an Agent object
 */
function parseAgentRow(row: any): Agent {
  return {
    id: row.id,
    name: row.name,
    status: row.status as AgentStatus,
    version: row.version || undefined,
    capabilities: row.capabilities ? JSON.parse(row.capabilities) : undefined,
    registered_at: row.registered_at,
    last_heartbeat: row.last_heartbeat,
  };
}

/**
 * Register a new agent
 */
export function registerAgent(req: RegisterAgentRequest): Agent {
  const db = getDb();
  const agentId = uuidv4();

  const stmt = db.prepare(`
    INSERT INTO agents (id, name, status, version, capabilities, last_heartbeat)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  stmt.run(
    agentId,
    req.name,
    'online',
    req.version || null,
    req.capabilities ? JSON.stringify(req.capabilities) : null
  );

  logger.info(SERVICE_NAME, `Agent registered: ${agentId}`, {
    name: req.name,
    version: req.version,
  });

  // Fetch and return the created agent
  const getStmt = db.prepare('SELECT * FROM agents WHERE id = ?');
  const row = getStmt.get(agentId);

  if (!row) {
    throw new Error('Failed to retrieve registered agent');
  }

  return parseAgentRow(row);
}

/**
 * Send a heartbeat from an agent
 */
export function heartbeat(
  agentId: string,
  status?: 'online' | 'offline'
): { acknowledged_at: string; next_heartbeat_due_at: string } {
  const db = getDb();

  // Verify agent exists
  const getStmt = db.prepare('SELECT * FROM agents WHERE id = ?');
  const agent = getStmt.get(agentId);

  if (!agent) {
    throw new NotFoundError('Agent', agentId);
  }

  // Update last_heartbeat and optionally status
  const updateStmt = db.prepare(`
    UPDATE agents
    SET last_heartbeat = datetime('now'), status = ?
    WHERE id = ?
  `);

  updateStmt.run(status || 'online', agentId);

  logger.debug(SERVICE_NAME, `Heartbeat received from agent: ${agentId}`, {
    status: status || 'online',
  });

  // Get current time as ISO string
  const now = new Date();
  const acknowledgedAt = now.toISOString();

  // Calculate next heartbeat due (30 seconds from now)
  const nextHeartbeatTime = new Date(now.getTime() + 30000);
  const nextHeartbeatDueAt = nextHeartbeatTime.toISOString();

  return {
    acknowledged_at: acknowledgedAt,
    next_heartbeat_due_at: nextHeartbeatDueAt,
  };
}

/**
 * Get an agent by ID
 */
export function getAgent(agentId: string): Agent {
  const db = getDb();

  const stmt = db.prepare('SELECT * FROM agents WHERE id = ?');
  const row = stmt.get(agentId);

  if (!row) {
    throw new NotFoundError('Agent', agentId);
  }

  return parseAgentRow(row);
}

/**
 * List all agents, optionally filtered by status
 */
export function listAgents(status?: AgentStatus): Agent[] {
  const db = getDb();

  let stmt;
  if (status) {
    stmt = db.prepare('SELECT * FROM agents WHERE status = ?');
  } else {
    stmt = db.prepare('SELECT * FROM agents');
  }

  const rows = status ? stmt.all(status) : stmt.all();

  return rows.map(parseAgentRow);
}

/**
 * Mark an agent as offline
 */
export function markOffline(agentId: string): void {
  const db = getDb();

  // Verify agent exists
  const getStmt = db.prepare('SELECT * FROM agents WHERE id = ?');
  const agent = getStmt.get(agentId);

  if (!agent) {
    throw new NotFoundError('Agent', agentId);
  }

  // Update status to offline
  const updateStmt = db.prepare('UPDATE agents SET status = ? WHERE id = ?');
  updateStmt.run('offline', agentId);

  logger.info(SERVICE_NAME, `Agent marked offline: ${agentId}`);
}
