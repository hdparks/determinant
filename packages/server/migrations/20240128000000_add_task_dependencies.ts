import { Knex } from 'knex';

/**
 * Migration 003: Add task dependencies
 * Adds depends_on_task_id column to tasks table for task dependency chains
 */
export async function up(knex: Knex): Promise<void> {
  // Check if column exists
  const hasDependsOnTaskId = await knex.raw(`
    SELECT COUNT(*) as count 
    FROM pragma_table_info('tasks') 
    WHERE name = 'depends_on_task_id'
  `).then((result: any) => result[0].count > 0);

  if (!hasDependsOnTaskId) {
    await knex.raw(`
      ALTER TABLE tasks 
      ADD COLUMN depends_on_task_id TEXT 
      REFERENCES tasks(id) 
      ON DELETE SET NULL
    `);
    
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_tasks_depends_on 
      ON tasks(depends_on_task_id)
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  throw new Error('No rollbacks supported - forward-only migrations');
}
