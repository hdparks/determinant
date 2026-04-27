import { Knex } from 'knex';

/**
 * Migration 004: Add claimable column
 * Adds claimable column to nodes table to distinguish agent-claimable vs human checkpoint nodes
 */
export async function up(knex: Knex): Promise<void> {
  // Check if column exists
  const hasClaimable = await knex.raw(`
    SELECT COUNT(*) as count 
    FROM pragma_table_info('nodes') 
    WHERE name = 'claimable'
  `).then((result: any) => result[0].count > 0);

  if (!hasClaimable) {
    await knex.raw(`
      ALTER TABLE nodes 
      ADD COLUMN claimable INTEGER DEFAULT 1 NOT NULL
    `);
    
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_nodes_claimable 
      ON nodes(claimable)
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  throw new Error('No rollbacks supported - forward-only migrations');
}
