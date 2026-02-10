import app from './app.js';
import { config } from './config.js';
import { getDb, closeDb } from './database/db.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { logger } from './utils/logger.js';

// Initialize database
getDb();

// Start scheduler
startScheduler();

// Start server
const server = app.listen(config.server.port, config.server.host, () => {
  logger.info(
    'Server',
    `Agora running at http://${config.server.host}:${config.server.port}`
  );
  logger.info('Server', 'API endpoints:');
  logger.info('Server', '  POST   /api/agents/register');
  logger.info('Server', '  POST   /api/agents/:id/heartbeat');
  logger.info('Server', '  GET    /api/agents');
  logger.info('Server', '  POST   /api/jobs');
  logger.info('Server', '  GET    /api/jobs');
  logger.info('Server', '  GET    /api/jobs/:id');
  logger.info('Server', '  GET    /api/jobs/:id/tasks');
  logger.info('Server', '  POST   /api/tasks/claim');
  logger.info('Server', '  POST   /api/tasks/:id/start');
  logger.info('Server', '  POST   /api/tasks/:id/progress');
  logger.info('Server', '  POST   /api/tasks/:id/complete');
  logger.info('Server', '  POST   /api/tasks/:id/fail');
  logger.info('Server', '  GET    /api/health');
  logger.info('Server', '  GET    /api/stats');
});

// Graceful shutdown
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;   // prevent re-entry from repeated signals
  shuttingDown = true;

  logger.info('Server', `Received ${signal}, shutting down gracefully...`);
  stopScheduler();

  // Force-close all keep-alive connections so server.close() resolves immediately
  server.closeAllConnections();

  server.close(() => {
    closeDb();
    logger.info('Server', 'Server closed');
    process.exit(0);
  });

  // Force exit after 3s (tsx watch waits 5s, so stay well under that)
  setTimeout(() => {
    logger.error('Server', 'Forced shutdown after timeout');
    process.exit(1);
  }, 3_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
