import Database from 'better-sqlite3';
import { ulid } from 'ulidx';

let db: Database.Database | null = null;

export function initDb(path: string = './determinant.db'): Database.Database {
  if (db) return db;

  db = new Database(path);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      vibe TEXT NOT NULL,
      pins TEXT DEFAULT '[]',
      hints TEXT DEFAULT '[]',
      state TEXT NOT NULL CHECK(state IN ('Proposed', 'Planned', 'Executed', 'Verified', 'Released')),
      priority INTEGER DEFAULT 3 CHECK(priority >= 1 AND priority <= 5),
      manual_weight INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      parent_node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
      from_stage TEXT,
      to_stage TEXT NOT NULL,
      content TEXT DEFAULT '',
      confidence_before INTEGER CHECK(confidence_before >= 1 AND confidence_before <= 10),
      confidence_after INTEGER CHECK(confidence_after >= 1 AND confidence_after <= 10),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_claims (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      claimed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_task_id ON nodes(task_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_node_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
    CREATE INDEX IF NOT EXISTS idx_agent_claims_expires ON agent_claims(expires_at);
  `);

  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function newId(): string {
  return ulid();
}