# Database Migrations

This directory contains database schema migrations for Determinant, managed by [Knex.js](https://knexjs.org/).

## Migration Philosophy

- **Forward-only**: Migrations cannot be rolled back in production
- **Tracked**: Applied migrations are recorded in the `knex_migrations` table
- **Automatic**: Migrations run automatically on server startup
- **TypeScript**: Migrations are written in TypeScript with full type safety

## Migration Files

Migrations are named with timestamps to ensure proper ordering:

```
YYYYMMDDHHMMSS_description.ts
```

### Current Migrations

1. **001_initial_schema** - Creates base tasks and nodes tables
2. **002_add_working_dir** - Adds working directory column to tasks
3. **003_add_task_dependencies** - Adds task dependency support
4. **004_add_claimable_column** - Adds claimable flag to nodes
5. **005_rename_questions_approval** - Renames QuestionsApproval state
6. **006_update_check_constraints** - Updates CHECK constraints to support all 10 workflow states

## Creating a New Migration

```bash
# Create a new migration file
npm run db:migrate:make add_my_feature -w packages/server

# This creates: migrations/TIMESTAMP_add_my_feature.ts
```

Edit the generated file:

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Write SQL or use Knex query builder
  await knex.raw(`
    ALTER TABLE tasks ADD COLUMN my_column TEXT
  `);
}

export async function down(knex: Knex): Promise<void> {
  // We use forward-only migrations
  throw new Error('No rollbacks supported - forward-only migrations');
}
```

## Running Migrations

### Automatic (Recommended)

Migrations run automatically when the server starts via `initDb()`.

### Manual

```bash
# Check migration status (requires build first)
npm run build -w packages/server
npm run db:migrate:status -w packages/server

# Run pending migrations
npm run db:migrate -w packages/server

# List all migrations
npm run db:migrate:list -w packages/server
```

## Migration Best Practices

### 1. Idempotency

Always check if changes already exist:

```typescript
export async function up(knex: Knex): Promise<void> {
  // Check if column exists before adding
  const hasColumn = await knex.raw(`
    SELECT COUNT(*) as count 
    FROM pragma_table_info('tasks') 
    WHERE name = 'my_column'
  `).then((result: any) => result[0].count > 0);

  if (!hasColumn) {
    await knex.raw(`ALTER TABLE tasks ADD COLUMN my_column TEXT`);
  }
}
```

### 2. Use Transactions

Knex automatically wraps each migration in a transaction. Complex operations are atomic:

```typescript
export async function up(knex: Knex): Promise<void> {
  // All these operations commit together or rollback together
  await knex.raw(`CREATE TABLE temp AS SELECT * FROM tasks`);
  await knex.raw(`DROP TABLE tasks`);
  await knex.raw(`CREATE TABLE tasks (...)`);
  await knex.raw(`INSERT INTO tasks SELECT * FROM temp`);
  await knex.raw(`DROP TABLE temp`);
}
```

### 3. Create Backups for Destructive Changes

```typescript
import fs from 'fs';

export async function up(knex: Knex): Promise<void> {
  const dbPath = (knex.client.config.connection as any).filename;
  const backupPath = `${dbPath}.backup-${Date.now()}`;
  
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`✅ Created backup: ${backupPath}`);
  }
  
  // ... destructive changes ...
}
```

### 4. Validate Data Integrity

```typescript
export async function up(knex: Knex): Promise<void> {
  const countBefore = await knex('tasks').count('* as count').first()
    .then((result: any) => result.count);
  
  // ... migration logic ...
  
  const countAfter = await knex('tasks').count('* as count').first()
    .then((result: any) => result.count);
  
  if (countBefore !== countAfter) {
    throw new Error('Migration validation failed: row counts do not match');
  }
}
```

### 5. Never Edit Applied Migrations

Once a migration is applied and committed to git:
- ❌ Never edit it
- ✅ Create a new migration to fix issues

## Common Patterns

### Adding a Column

```typescript
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE tasks ADD COLUMN status TEXT DEFAULT 'active'`);
}
```

### Creating an Index

```typescript
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
}
```

### Data Migration

```typescript
export async function up(knex: Knex): Promise<void> {
  // Update existing data
  await knex.raw(`
    UPDATE tasks 
    SET state = 'NewState' 
    WHERE state = 'OldState'
  `);
}
```

### Complex Table Recreation (for CHECK constraints)

See migration `006_update_check_constraints.ts` for a full example of:
- Creating backup tables
- Dropping and recreating tables
- Restoring data with explicit column mapping
- Validating row counts
- Handling foreign keys

## Troubleshooting

### Migration Failed

If a migration fails:
1. Check the error message in console
2. Transaction automatically rolled back - database is safe
3. Fix the migration file
4. Rebuild: `npm run build -w packages/server`
5. Try again: server startup or `npm run db:migrate`

### Migration Already Applied

Knex tracks migrations in the `knex_migrations` table. To see what's applied:

```sql
SELECT * FROM knex_migrations ORDER BY id;
```

### Force Re-run a Migration

**⚠️ Dangerous - only for development:**

```sql
-- Remove migration from tracking table
DELETE FROM knex_migrations WHERE name = '20240426000000_update_check_constraints.ts';
```

Then restart the server or run `npm run db:migrate`.

## Schema Evolution Example

```
Initial → Add Column → Add Index → Update Constraints
  ↓          ↓            ↓              ↓
 001    →   002      →   003        →   006
```

Each migration builds on the previous state, creating a clear history of schema evolution.

## CI/CD Integration

In production deployments:

```bash
# 1. Build the application
npm run build

# 2. Run migrations
npm run db:migrate -w packages/server

# 3. Start the server
npm start
```

Or rely on automatic migration during server startup (current behavior).
