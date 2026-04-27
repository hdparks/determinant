import Database from 'better-sqlite3';
import { ulid } from 'ulidx';
import Knex from 'knex';
import knexConfig from './knexfile.js';

let db: Database.Database | null = null;

export async function initDb(path: string = './determinant.db'): Promise<Database.Database> {
  if (db) return db;

  // Create better-sqlite3 connection
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations using Knex
  const knex = Knex({
    ...knexConfig,
    connection: { filename: path }
  });

  try {
    await knex.migrate.latest();
    console.log('✅ Database migrations completed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await knex.destroy();
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

/**
 * Create a transaction-wrapped version of a function.
 * All database operations within the function will execute atomically.
 * 
 * @param operation - Function to wrap in a transaction
 * @returns Transaction-wrapped function that ensures atomicity
 * 
 * @example
 * const atomicOp = createTransaction((arg1, arg2) => {
 *   db.prepare('INSERT ...').run(arg1);
 *   db.prepare('UPDATE ...').run(arg2);
 *   // Both operations commit together or rollback together
 * });
 */
export function createTransaction<T extends (...args: any[]) => any>(
  operation: T
): T {
  const db = getDb();
  // Use type assertion through unknown to satisfy TypeScript
  return db.transaction(operation) as unknown as T;
}
