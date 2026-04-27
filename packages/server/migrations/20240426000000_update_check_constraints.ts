import { Knex } from 'knex';
import fs from 'fs';

/**
 * Migration 006: Update CHECK constraints to include all 10 workflow states
 * Adds QuestionAnswers, Design, and DesignApproval to the CHECK constraints
 * 
 * This is a complex migration that recreates tables to update CHECK constraints.
 * SQLite doesn't support ALTER TABLE to modify CHECK constraints.
 */
export async function up(knex: Knex): Promise<void> {
  // Check if migration is needed by querying the schema
  const tasksSchemaResult = await knex.raw(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name='tasks'
  `);
  const tasksSchema = tasksSchemaResult[0]?.sql as string | undefined;

  const nodesSchemaResult = await knex.raw(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name='nodes'
  `);
  const nodesSchema = nodesSchemaResult[0]?.sql as string | undefined;

  // Only run if schema is missing the new states
  const needsMigration = (tasksSchema && nodesSchema) && (
    !tasksSchema.includes('QuestionAnswers') ||
    !tasksSchema.includes('Design') ||
    !tasksSchema.includes('DesignApproval') ||
    !nodesSchema.includes('QuestionAnswers') ||
    !nodesSchema.includes('Design') ||
    !nodesSchema.includes('DesignApproval')
  );

  if (!needsMigration) {
    console.log('✅ CHECK constraints already up to date, skipping migration');
    return;
  }

  console.log('🔄 Updating CHECK constraints to support all 10 workflow states...');

  // Create filesystem backup
  const dbPath = (knex.client.config.connection as any).filename || './determinant.db';
  const backupPath = `${dbPath}.backup-${Date.now()}`;
  
  try {
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`✅ Created backup: ${backupPath}`);
    }
  } catch (err) {
    console.error('⚠️  Warning: Could not create backup file:', err);
  }

  // Temporarily disable foreign keys for table recreation
  await knex.raw('PRAGMA foreign_keys = OFF');

  try {
    // Get row counts for validation
    const taskCountBefore = await knex('tasks').count('* as count').first()
      .then((result: any) => result.count);
    const nodeCountBefore = await knex('nodes').count('* as count').first()
      .then((result: any) => result.count);
    
    console.log(`📊 Current data: ${taskCountBefore} tasks, ${nodeCountBefore} nodes`);

    // Create backup tables
    await knex.raw('CREATE TABLE tasks_backup AS SELECT * FROM tasks');
    await knex.raw('CREATE TABLE nodes_backup AS SELECT * FROM nodes');

    // Drop existing tables
    await knex.raw('DROP TABLE nodes');
    await knex.raw('DROP TABLE tasks');

    // Recreate tables with updated CHECK constraints (10 states)
    await knex.raw(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        vibe TEXT NOT NULL,
        pins TEXT DEFAULT '[]',
        hints TEXT DEFAULT '[]',
        state TEXT NOT NULL CHECK(state IN ('Proposal', 'Questions', 'QuestionAnswers', 'Research', 'Design', 'DesignApproval', 'Plan', 'Implement', 'Validate', 'Released')),
        priority INTEGER DEFAULT 3 CHECK(priority >= 1 AND priority <= 5),
        manual_weight INTEGER DEFAULT 0,
        working_dir TEXT,
        depends_on_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    await knex.raw(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        parent_node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
        from_stage TEXT CHECK(from_stage IS NULL OR from_stage IN ('Proposal', 'Questions', 'QuestionAnswers', 'Research', 'Design', 'DesignApproval', 'Plan', 'Implement', 'Validate', 'Released')),
        to_stage TEXT NOT NULL CHECK(to_stage IN ('Proposal', 'Questions', 'QuestionAnswers', 'Research', 'Design', 'DesignApproval', 'Plan', 'Implement', 'Validate', 'Released')),
        content TEXT DEFAULT '',
        confidence_before INTEGER CHECK(confidence_before >= 1 AND confidence_before <= 10),
        confidence_after INTEGER CHECK(confidence_after >= 1 AND confidence_after <= 10),
        claimable INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT NOT NULL,
        processed_at TEXT
      )
    `);

    // Recreate indexes
    await knex.raw('CREATE INDEX idx_nodes_task_id ON nodes(task_id)');
    await knex.raw('CREATE INDEX idx_nodes_parent ON nodes(parent_node_id)');
    await knex.raw('CREATE INDEX idx_nodes_processed_at ON nodes(processed_at)');
    await knex.raw('CREATE INDEX idx_tasks_state ON tasks(state)');
    await knex.raw('CREATE INDEX idx_tasks_depends_on ON tasks(depends_on_task_id)');
    await knex.raw('CREATE INDEX idx_nodes_claimable ON nodes(claimable)');

    // Restore data with explicit column mapping
    await knex.raw(`
      INSERT INTO tasks (id, vibe, pins, hints, state, priority, manual_weight, working_dir, depends_on_task_id, created_at, updated_at)
      SELECT id, vibe, pins, hints, state, priority, manual_weight, working_dir, depends_on_task_id, created_at, updated_at
      FROM tasks_backup
    `);
    
    await knex.raw(`
      INSERT INTO nodes (id, task_id, parent_node_id, from_stage, to_stage, content, confidence_before, confidence_after, claimable, created_at, processed_at)
      SELECT id, task_id, parent_node_id, from_stage, to_stage, content, confidence_before, confidence_after, claimable, created_at, processed_at
      FROM nodes_backup
    `);

    // Validate row counts
    const taskCountAfter = await knex('tasks').count('* as count').first()
      .then((result: any) => result.count);
    const nodeCountAfter = await knex('nodes').count('* as count').first()
      .then((result: any) => result.count);

    if (taskCountBefore !== taskCountAfter || nodeCountBefore !== nodeCountAfter) {
      throw new Error(
        `Migration validation failed! Before: ${taskCountBefore} tasks, ${nodeCountBefore} nodes. ` +
        `After: ${taskCountAfter} tasks, ${nodeCountAfter} nodes`
      );
    }

    // Cleanup backup tables
    await knex.raw('DROP TABLE tasks_backup');
    await knex.raw('DROP TABLE nodes_backup');

    console.log(`✅ Migration complete: ${taskCountAfter} tasks and ${nodeCountAfter} nodes preserved`);
  } finally {
    // Re-enable foreign keys
    await knex.raw('PRAGMA foreign_keys = ON');
  }

  console.log('✅ Database now supports all 10 workflow states with CHECK constraints');
}

export async function down(knex: Knex): Promise<void> {
  throw new Error('No rollbacks supported - forward-only migrations');
}
