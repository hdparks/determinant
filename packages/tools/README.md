# Determinant Tools

Utility scripts for managing and recovering Determinant tasks.

## Scripts

### restore-task.mjs

Recovers a task from its artifact files when the database has been cleared or corrupted.

**Usage:**
```bash
node packages/tools/restore-task.mjs <task-id> [options]
```

**Options:**
- `--working-dir=<path>` - Override working directory for the restored task
- `--db-path=<path>` - Path to database file (default: packages/server/determinant.db)
- `--dry-run` - Show what would be restored without making changes

**Examples:**

Check what would be restored (dry run):
```bash
node packages/tools/restore-task.mjs 01KPY76T3HHHDPAGR55RSDGPCS --dry-run
```

Restore a task:
```bash
node packages/tools/restore-task.mjs 01KPY76T3HHHDPAGR55RSDGPCS
```

Restore with custom working directory:
```bash
node packages/tools/restore-task.mjs 01KPY76T3HHHDPAGR55RSDGPCS --working-dir=./packages/server
```

**How it works:**

1. Searches for artifact directory in common locations (`.determinant/artifacts/<task-id>`)
2. Parses the Proposal artifact to extract task metadata (vibe, pins, hints)
3. Creates a new task in the database with the same metadata
4. Recreates all historical nodes from the artifacts (Proposal → Questions → Research → Plan → Implement → Validate)
5. Marks completed stages as processed
6. Creates the next unprocessed node if applicable

**When to use:**

- Database file was accidentally deleted or corrupted
- Need to recover a task from artifacts after data loss
- Migrating tasks between environments
- Restoring specific task states for debugging

**Limitations:**

- Requires artifact files to still exist on disk
- Creates new task and node IDs (cannot preserve original ULIDs)
- Infers confidence scores based on stage position
- Cannot restore if artifacts were also deleted

## Future Tools

Ideas for additional recovery/management tools:

- **backup-db.mjs** - Create timestamped database backups
- **list-artifacts.mjs** - Show all available task artifacts on disk
- **export-task.mjs** - Export a task to a portable format
- **import-task.mjs** - Import a task from exported format
