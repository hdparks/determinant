import { Knex } from 'knex';

/**
 * Migration 001: Initial Schema
 * Creates the base tasks and nodes tables with initial CHECK constraints
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      vibe TEXT NOT NULL,
      pins TEXT DEFAULT '[]',
      hints TEXT DEFAULT '[]',
      state TEXT NOT NULL CHECK(state IN ('Proposal', 'Questions', 'Research', 'Plan', 'Implement', 'Validate', 'Released')),
      priority INTEGER DEFAULT 3 CHECK(priority >= 1 AND priority <= 5),
      manual_weight INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await knex.raw(`
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
    )
  `);

  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_nodes_task_id ON nodes(task_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_node_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_nodes_processed_at ON nodes(processed_at)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state)`);
}

export async function down(knex: Knex): Promise<void> {
  throw new Error('No rollbacks supported - forward-only migrations');
}
