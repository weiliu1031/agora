import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { initializeSchema } from './schema.js';
import { logger } from '../utils/logger.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbDir = path.dirname(config.database.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(config.database.path);

    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    initializeSchema(db);

    logger.info('Database', `Connected to SQLite at ${config.database.path}`);
  }

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database', 'Connection closed');
  }
}
