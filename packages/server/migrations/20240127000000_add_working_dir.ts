import { Knex } from 'knex';

/**
 * Migration 002: Add working_dir column
 * Adds working_dir column to tasks table for storing task workspace paths
 */
export async function up(knex: Knex): Promise<void> {
  // Check if column exists
  const hasWorkingDir = await knex.raw(`
    SELECT COUNT(*) as count 
    FROM pragma_table_info('tasks') 
    WHERE name = 'working_dir'
  `).then((result: any) => result[0].count > 0);

  if (!hasWorkingDir) {
    await knex.raw(`ALTER TABLE tasks ADD COLUMN working_dir TEXT`);
  }
}

export async function down(knex: Knex): Promise<void> {
  throw new Error('No rollbacks supported - forward-only migrations');
}
