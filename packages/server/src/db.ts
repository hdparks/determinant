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
      state TEXT NOT NULL CHECK(state IN ('Proposal', 'Questions', 'Research', 'Plan', 'Implement', 'Validate', 'Released')),
      priority INTEGER DEFAULT 3 CHECK(priority >= 1 AND priority <= 5),
      manual_weight INTEGER DEFAULT 0,
      working_dir TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      parent_node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
      from_stage TEXT CHECK(from_stage IS NULL OR from_stage IN ('Proposal', 'Questions', 'Research', 'Plan', 'Implement', 'Validate', 'Released')),
      to_stage TEXT NOT NULL CHECK(to_stage IN ('Proposal', 'Questions', 'Research', 'Plan', 'Implement', 'Validate', 'Released')),
      content TEXT DEFAULT '',
      confidence_before INTEGER CHECK(confidence_before >= 1 AND confidence_before <= 10),
      confidence_after INTEGER CHECK(confidence_after >= 1 AND confidence_after <= 10),
      created_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_task_id ON nodes(task_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_node_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_processed_at ON nodes(processed_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
  `);

  // Migration: Add working_dir column if it doesn't exist (for existing databases)
  const hasWorkingDir = db.prepare(`
    SELECT COUNT(*) as count 
    FROM pragma_table_info('tasks') 
    WHERE name = 'working_dir'
  `).get() as { count: number };

  if (hasWorkingDir.count === 0) {
    db.exec(`ALTER TABLE tasks ADD COLUMN working_dir TEXT`);
  }

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