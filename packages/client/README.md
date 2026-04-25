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

### Notification Settings

The CLI includes a configurable notification system that can play sounds when tasks complete or when the worker processes nodes:

- `DETERMINANT_NOTIFY_ENABLED` - Enable/disable notifications (default: true)
- `DETERMINANT_NOTIFY_SOUND_ENABLED` - Enable/disable sound playback (default: true)
- `DETERMINANT_NOTIFY_VOLUME` - Set volume 0.0-1.0 (default: 0.5)
- `DETERMINANT_NOTIFY_VERBOSE` - Enable verbose logging (default: false)
- `DETERMINANT_NOTIFY_SOUND_SUCCESS` - Path to success sound file (optional)
- `DETERMINANT_NOTIFY_SOUND_ERROR` - Path to error sound file (optional)
- `DETERMINANT_NOTIFY_SOUND_WARNING` - Path to warning sound file (optional)

**Platform Requirements:**
- **macOS**: Uses `afplay` (built-in)
- **Linux**: Requires `aplay` (install via `sudo apt-get install alsa-utils`)

**Example:**
```bash
export DETERMINANT_NOTIFY_ENABLED=true
export DETERMINANT_NOTIFY_SOUND_ENABLED=true
export DETERMINANT_NOTIFY_VOLUME=0.7
export DETERMINANT_NOTIFY_SOUND_SUCCESS=/path/to/success.wav
```

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
- `state` (optional) - Filter by state (Proposal, Questions, Research, Plan, Implement, Validate, Released)

**Examples:**
```bash
npm run cli -- list
npm run cli -- list Proposal
npm run cli -- list Validate
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
- `state` (optional) - State to view queue for (default: Proposal)

**Options:**
- `--limit=N` - Maximum number of items to show (default: 10)

**Examples:**
```bash
npm run cli -- queue
npm run cli -- queue Plan --limit=20
```

**Aliases:** `q`

### `set-state <id> <state>`
Manually update a task's state.

**Arguments:**
- `id` (required) - The task ID
- `state` (required) - New state (Proposal, Questions, Research, Plan, Implement, Validate, Released)

**Examples:**
```bash
npm run cli -- set-state 01HZXXX... Implement
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

### `notify-config [--test=...]`
View notification settings or test notifications.

**Options:**
- `--test=<type>` - Test a notification type

**Examples:**
```bash
# View current notification settings
det notify-config

# Test a notification
det notify-config --test=node_complete
```

**Aliases:** `notifications`

### `help`
Show help message.

**Aliases:** `-h`, `--help`

## Task States

Tasks progress through the following states:

1. **Proposal** - Initial task proposal
2. **Questions** - Clarifying questions gathered
3. **Research** - Research and analysis completed
4. **Plan** - Implementation plan created
5. **Implement** - Work completed, ready for validation
6. **Validate** - Validation and verification performed
7. **Released** - Released to production

## Priority

Tasks have a priority from 1 (highest) to 5 (lowest). This affects queue ordering.

## Document Linking

Determinant uses document linking to reduce token usage and improve performance. Research documents are automatically summarized and linked in plan artifacts.

### How It Works

- Research documents are summarized (first 50 lines)
- Plan artifacts contain markdown links to full research: `[Research: ...](./research.md)`
- Links are clickable in VS Code and other markdown viewers
- Token usage reduced by >90% in typical scenarios

### Artifact Paths

All artifacts use deterministic, stage-based naming:
- `.determinant/artifacts/{taskId}/proposal.md`
- `.determinant/artifacts/{taskId}/questions.md`
- `.determinant/artifacts/{taskId}/research.md`
- `.determinant/artifacts/{taskId}/plan.md`
- `.determinant/artifacts/{taskId}/implement.md`
- `.determinant/artifacts/{taskId}/validate.md`

This predictable structure enables:
- **Crash recovery**: Agents can resume partial work on retry
- **Easy debugging**: Know exactly where to find artifacts
- **Overwrite behavior**: Repair cycles update existing files

### Artifact Building Strategy

Agents are instructed to build markdown artifacts incrementally:
- Write content continuously as work progresses
- Don't wait until the end to create the artifact
- Update files at deterministic paths: `.determinant/artifacts/{taskId}/{stage}.md`
- If interrupted, partial progress is preserved
- Retries detect existing artifacts and continue from where the previous attempt left off

This approach improves resilience to timeouts and crashes, especially for
long-running stages like Research (which may generate 1,000+ line documents).

**Benefits:**
- Faster recovery from interruptions (no need to start over)
- Reduced total execution time when retries are needed
- More robust handling of complex tasks
- Better progress tracking (artifacts grow incrementally)

### Fallback Behavior

If a linked artifact is missing or inaccessible:
1. Warning message logged to console
2. System attempts to retrieve content from database
3. Process continues with available content
4. No task failure due to missing artifacts

### Benefits

- **Reduced token usage**: 90%+ reduction in prompt size
- **Faster processing**: Smaller prompts = faster LLM responses
- **Lower costs**: Fewer tokens = lower API costs
- **Better organization**: Clear document separation and references
- **Crash recovery**: Automatic resumption from partial work

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
const queue = await client.getQueue('Proposal', 10);

// Update task state
await client.updateTaskState(taskId, { state: 'Plan' });

// Claim task
const claim = await client.claimTask({ taskId, ttlMinutes: 30 });

// Release claim
await client.releaseClaim(claim.id);
```

## License

MIT
