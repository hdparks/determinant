# @determinant/client

CLI tool for interacting with the Determinant task management server.

## Installation

```bash
npm install
npm run build
```

## Configuration

Configure the client via environment variables:

- `DETERMINANT_SERVER_URL` - Server URL (default: http://localhost:10110)
- `DETERMINANT_API_KEY` - API key for authentication (if server requires it)

## Usage

From the monorepo root:

```bash
npm run cli -- <command> [options]
```

Or directly (after building):

```bash
./packages/client/dist/cli.js <command> [options]
```

Or if installed globally via `npm link`:

```bash
det <command> [options]
```

## Commands

### `add <title>`
Create a new task.

**Options:**
- `--priority=1-5` - Set task priority (1 highest, 5 lowest, default: 3)

**Examples:**
```bash
npm run cli -- add "Implement user authentication"
npm run cli -- add "Fix login bug" --priority=1
```

### `list [state]`
List tasks, optionally filtered by state.

**Arguments:**
- `state` (optional) - Filter by state (Proposed, Planned, Executed, Verified, Released)

**Examples:**
```bash
npm run cli -- list
npm run cli -- list Proposed
npm run cli -- list Verified
```

**Aliases:** `ls`

### `get <task-id>`
Get detailed information about a task, including all workflow nodes.

**Arguments:**
- `task-id` (required) - The task ID

**Examples:**
```bash
npm run cli -- get 01HZXXX...
```

**Aliases:** `show`

### `queue [state]`
Show the priority queue for a given state.

**Arguments:**
- `state` (optional) - State to view queue for (default: Proposed)

**Options:**
- `--limit=N` - Maximum number of items to show (default: 10)

**Examples:**
```bash
npm run cli -- queue
npm run cli -- queue Planned --limit=20
```

**Aliases:** `q`

### `set-state <id> <state>`
Manually update a task's state.

**Arguments:**
- `id` (required) - The task ID
- `state` (required) - New state (Proposed, Planned, Executed, Verified, Released)

**Examples:**
```bash
npm run cli -- set-state 01HZXXX... Executed
```

### `heap-config [--set=...]`
View or update heap weight configuration.

**Options:**
- `--set=key=value,...` - Set heap configuration values

**Examples:**
```bash
# View current configuration
npm run cli -- heap-config

# Update weights (should sum to 1.0)
npm run cli -- heap-config --set=priorityWeight=0.7,confidenceWeight=0.3,manualWeight=0.0
```

### `help`
Show help message.

**Aliases:** `-h`, `--help`

## Task States

Tasks progress through the following states:

1. **Proposed** - New task, awaiting planning
2. **Planned** - Plan created, ready for execution
3. **Executed** - Work completed, awaiting verification
4. **Verified** - Verified and ready for release
5. **Released** - Released to production

## Priority

Tasks have a priority from 1 (highest) to 5 (lowest). This affects queue ordering.

## Client Library

The package also exports a `DeterminantClient` class for programmatic use:

```typescript
import { DeterminantClient } from '@determinant/client';

const client = new DeterminantClient({
  baseUrl: 'http://localhost:10110',
  apiKey: 'your-api-key'
});

// Create task
const result = await client.createTask({
  title: 'Build API',
  priority: 2
});

// List tasks
const tasks = await client.listTasks();

// Get queue
const queue = await client.getQueue('Proposed', 10);

// Update task state
await client.updateTaskState(taskId, { state: 'Planned' });

// Claim task
const claim = await client.claimTask({ taskId, ttlMinutes: 30 });

// Release claim
await client.releaseClaim(claim.id);
```

## License

MIT
