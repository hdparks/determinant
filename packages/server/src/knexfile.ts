import type { Knex } from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: Knex.Config = {
  client: 'better-sqlite3',
  connection: {
    filename: process.env.DB_PATH || './determinant.db'
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.join(__dirname, '../migrations'),
    extension: 'ts',
    tableName: 'knex_migrations',
    loadExtensions: ['.ts']
  }
};

export default config;
