---
name: determinant-cli
description: Guide for using the Determinant task management CLI
license: MIT
compatibility: opencode
metadata:
  version: "1.0"
  category: tooling
---

## What is Determinant

Determinant is an agentic workflow pipeline that manages tasks through a structured state progression. It provides two command-line interfaces:

- **`det`** - Interactive task management (create, list, view, configure)
- **`det run`** - Automated worker agent for queue processing

Tasks progress through states: Proposal → Questions → Research → Plan → Implement → Validate → Released

## Configuration

Before using the CLI, configure these environment variables:

- **`DETERMINANT_SERVER_URL`** - Server endpoint (default: `http://localhost:10110`)
- **`DETERMINANT_API_KEY`** - API key for authentication (optional, use if server requires it)

The server must be running before using either CLI. Both CLIs verify server connectivity on startup.

## Main CLI Commands (`det`)

### `det add`

Create a new task with a vibe (goal/user story).

**Usage:**
```bash
det add --vibe="..." [options]
det add "<vibe>" [options]
```

**Options:**
- `--vibe="..."` - Task vibe/thesis (required, or use positional argument)
- `--pin="..."` - Acceptance criteria (repeatable)
- `--hint="..."` - Additional context (repeatable)
- `--priority=1-5` - Task priority (1 highest, 5 lowest, default: 3)
- `--working-dir="/path"` - Working directory for task execution

**Example:**
```bash
det add --vibe="Implement login flow" --pin="Use JWT" --pin="Support OAuth" --hint="Check auth.ts" --priority=1
```

**Aliases:** `create`

---

### `det list`

List all tasks, optionally filtered by state.

**Usage:**
```bash
det list [state]
```

**Arguments:**
- `state` (optional) - Filter by state (Proposal, Questions, Research, Plan, Implement, Validate, Released)

**Example:**
```bash
det list Proposal
```

**Aliases:** `ls`

---

### `det get`

Get detailed information about a task, including all workflow nodes.

**Usage:**
```bash
det get <task-id>
```

**Arguments:**
- `task-id` (required) - The task ID to retrieve

**Example:**
```bash
det get 01HZXXX...
```

**Aliases:** `show`

---

### `det queue`

Show the priority queue of nodes ready to be processed.

**Usage:**
```bash
det queue [options]
```

**Options:**
- `--limit=N` - Maximum number of items to show (default: 10)

**Example:**
```bash
det queue --limit=20
```

**Aliases:** `q`

---

### `det set-state`

Manually update a task's state.

**Usage:**
```bash
det set-state <task-id> <state>
```

**Arguments:**
- `task-id` (required) - The task ID
- `state` (required) - New state (Proposal, Questions, Research, Plan, Implement, Validate, Released)

**Example:**
```bash
det set-state 01HZXXX... Implement
```

---

### `det heap-config`

View or update heap weight configuration for queue prioritization.

**Usage:**
```bash
det heap-config [--set=...]
```

**Options:**
- `--set=key=value,...` - Set configuration values (priorityWeight, confidenceWeight, manualWeight)

**Examples:**
```bash
# View current configuration
det heap-config

# Update weights (should sum to 1.0)
det heap-config --set=priorityWeight=0.7,confidenceWeight=0.3
```

---

### `det help`

Show help message with all available commands.

**Usage:**
```bash
det help
```

**Aliases:** `-h`, `--help`

## Worker CLI (`det run`)

The worker CLI provides an automated agent that processes tasks from the queue.

### `det run work`

Start processing tasks from the priority queue.

**Usage:**
```bash
det run work [options]
```

**Options:**
- `--ttl=<seconds>` - Time-to-live in seconds (default: 3600)

The worker will:
1. Pull the highest priority node from the queue
2. Process it (calls OpenCode to generate artifacts)
3. Save the resulting child node
4. Mark the current node as processed
5. Repeat until TTL expires or queue is empty

**Examples:**
```bash
det run work                    # Process queue for 1 hour (default)
det run work --ttl=1800         # Process queue for 30 minutes
det run work --ttl=7200         # Process queue for 2 hours
```

**Aliases:** `w`

---

### `det run help`

Show help message for the worker CLI.

**Usage:**
```bash
det run help
```

**Aliases:** `-h`, `--help`

## Task States

Tasks progress through these states in order:

1. **Proposal** - Initial task proposal
2. **Questions** - Clarifying questions gathered
3. **Research** - Research and analysis completed
4. **Plan** - Implementation plan created
5. **Implement** - Work completed, ready for validation
6. **Validate** - Validation and verification performed
7. **Released** - Released to production

Use these exact state names when filtering (`det list`) or setting states (`det set-state`).

## Common Patterns

### Creating Tasks with Multiple Requirements

Use repeatable flags to specify multiple acceptance criteria and hints:

```bash
det add --vibe="Add dark mode support" \
  --pin="Toggle in settings" \
  --pin="Persist preference" \
  --pin="Apply to all screens" \
  --hint="See theme.ts for current colors" \
  --priority=2
```

### Filtering and Viewing Tasks

List tasks by state, then view details:

```bash
det list Proposal           # Show all proposals
det get 01HZXXX...         # View specific task details
```

### Managing Priority

Higher priority tasks (1) are processed before lower priority tasks (5):

```bash
det add "Critical bug fix" --priority=1
det add "Nice to have feature" --priority=4
```

### Setting Working Directories

Specify where the task should be executed:

```bash
det add --vibe="Fix auth bug" --working-dir="./packages/server"
```

### Running the Worker Agent

Start the worker to automatically process queued tasks:

```bash
det run work --ttl=3600    # Run for 1 hour
```

The worker exits when the queue is empty or TTL expires.

## When to Use This Skill

Use this skill when you need to:

- **Create or manage Determinant tasks** via the command line
- **Understand command options** for the `det` or `det run` CLIs
- **Filter or query tasks** by state or priority
- **Configure the task processing system** (heap weights, priorities)
- **Automate task processing** with the worker agent

This skill covers CLI usage. For programmatic API usage, refer to the DeterminantClient class in `packages/client/src/client/index.ts`.
