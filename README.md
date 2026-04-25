# Determinant

Agentic workflow pipeline with task prioritization and confidence scoring.

## Overview

Determinant is a lightweight task management system designed for agentic workflows. Tasks progress linearly through stages, with each stage producing a markdown artifact that provides context for the next stage.

### Workflow Stages

```
Proposal → Questions → Research → Plan → Implement → Validate → Released
```

### Key Features

- **Linear task progression** - Tasks move through stages with markdown artifacts at each transition
- **Confidence scoring** - Agents self-assess their work (1-10) based on ambiguity and assumptions made
- **Branching** - When multiple valid solutions exist, agents can create branches with tradeoff explanations
- **Priority heap queue** - Configurable heuristics for task prioritization
- **Agent claiming** - Optimistic locking to prevent concurrent work on same task
- **Siloed agents** - Each agent works independently without inter-agent communication

## Project Structure

This is a monorepo with four packages:

- **`packages/server`** - Express API server with SQLite database
- **`packages/web`** - React-based web UI
- **`packages/client`** - CLI tool for interacting with the server
- **`packages/types`** - Shared TypeScript types

## Quick Start

### Development Mode

For local development with hot module reloading:

```bash
# Install all dependencies
npm install

# Build all packages
npm run build

# Terminal 1: Start the API server
npm run dev:server

# Terminal 2: Start the web dev server (with HMR)
npm run dev:web
```

Access the web UI at http://localhost:5173 (Vite dev server with hot reload)

**How it works:**
- Vite dev server runs on port 5173 with HMR
- API server runs on port 10110
- Vite proxies `/api` requests to the server
- CORS allows localhost:5173 origin

### Production Mode (Merged Deployment)

For production deployment with a single process serving both API and web:

```bash
# Install and build
npm install
npm run build

# Start server (serves both API and web UI)
npm start
```

Access the application at http://localhost:10110

**How it works:**
- Single Express server serves both API and static files
- Web files served from `packages/web/dist`
- API routes under `/api` prefix
- SPA fallback routing for client-side navigation
- Same-origin deployment (no CORS needed)

### Production Mode (Separate Deployment)

For CDN/static hosting of web UI with separate API server:

```bash
# Build all packages
npm install
npm run build

# Deploy packages/web/dist to static hosting
# Deploy packages/server separately
```

See [Environment Variables](#environment-variables) for configuration.

### Using the CLI

```bash
# In another terminal, use the CLI
npm run cli -- add "Implement user authentication"
npm run cli -- list
npm run cli -- queue Proposal
npm run cli -- get <task-id>
```

## CLI Commands

Use `npm run cli -- <command>` to run CLI commands:

| Command | Description |
|---------|-------------|
| `add <title>` | Create a new task |
| `list [state]` | List tasks (optionally by state) |
| `get <id>` | Get task details with artifacts |
| `queue [state]` | Show priority queue |
| `set-state <id> <state>` | Manually set task state |
| `heap-config [--set=...]` | Configure heap weights |

See `packages/client/README.md` for more details.

## Environment Variables

### Server Variables

Configure in `.env` or system environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `10110` | Server port for API and web serving |
| `DB_PATH` | `./determinant.db` | SQLite database file path |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS origins (comma-separated). Not needed for merged deployment (same-origin). |
| `DETERMINANT_API_KEY` | (none) | Optional API authentication key |

### Web Variables

Configure in `packages/web/.env.development` or `packages/web/.env.production`:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_DETERMINANT_SERVER_URL` | `http://localhost:10110` | API server base URL. Use empty string for same-origin (merged deployment). |

**Development setup:**
```bash
# packages/web/.env.development
VITE_DETERMINANT_SERVER_URL=http://localhost:10110
```

**Production setup (merged deployment):**
```bash
# packages/web/.env.production
VITE_DETERMINANT_SERVER_URL=
```

**Production setup (separate deployment):**
```bash
# packages/web/.env.production
VITE_DETERMINANT_SERVER_URL=https://api.example.com

# Server environment
ALLOWED_ORIGINS=https://myapp.example.com
```

## Architecture

### Database Schema

- **tasks** - id, title, description, state, priority, manualWeight, timestamps
- **artifacts** - id, taskId, parentArtifactId, fromStage, toStage, content, confidence scores
- **agent_claims** - Locking mechanism for concurrent agent work

### Priority Queue

Tasks are sorted using a weighted formula:
```
score = priorityWeight * (6 - priority) + confidenceWeight * confidence + manualWeight * manualWeight
```

Where:
- **priority**: 1 (highest) to 5 (lowest)
- **confidence**: 1 (low) to 10 (high), default 5 for new tasks
- **manualWeight**: Human override (default 0)

Higher score = higher priority to process.

### Heap Configuration

```bash
# View current config
npm run cli -- heap-config

# Adjust weights (values should sum to 1.0)
npm run cli -- heap-config --set=priorityWeight=0.7,confidenceWeight=0.3,manualWeight=0.0
```

## Deployment

### Process Management

For production, use a process manager to handle restarts and monitoring:

**Using PM2:**
```bash
npm install -g pm2
pm2 start packages/server/dist/index.js --name determinant
pm2 save
```

**Using systemd:**
```ini
# /etc/systemd/system/determinant.service
[Unit]
Description=Determinant Task Management Server
After=network.target

[Service]
Type=simple
User=determinant
WorkingDirectory=/path/to/determinant
ExecStart=/usr/bin/node /path/to/determinant/packages/server/dist/index.js
Restart=always
Environment=PORT=10110
Environment=DB_PATH=/var/lib/determinant/determinant.db

[Install]
WantedBy=multi-user.target
```

### Health Checks

Use the health endpoint to monitor server status:

```bash
curl http://localhost:10110/api/health
# Returns: {"status":"ok"}
```

### Database Backups

The SQLite database file (`determinant.db`) should be backed up regularly:

```bash
# Stop the server or use SQLite backup command
sqlite3 determinant.db ".backup determinant.backup.db"
```

For more details, see:
- `packages/server/README.md` - API server configuration and deployment
- `packages/web/README.md` - Web UI build and deployment options

## Programmatic Usage

```typescript
import { initDb, createTask, getTasksByState } from '@determinant/server';
import { getHeap } from '@determinant/server/heap';
import { BaseAgent, createLLMClient, AgentConfig } from '@determinant/server/agents/base';

// Initialize
initDb('./determinant.db');

// Create task
const task = createTask('Build API endpoint', 'Description here', 2);

// Get next task from queue
const heap = getHeap();
const nextTaskId = heap.getNextTask('Proposal');

// Create agent
const agent = new (class extends BaseAgent {
  async callLLM(prompt: string) {
    const client = createLLMClient({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o',
    });
    return client.call(prompt);
  }
})({
  id: 'agent-1',
  name: 'Worker',
  llm: { provider: 'openai' },
});

// Process task
const result = await agent.claimAndProcess(task.id);
console.log(result.success);
```

See `packages/server/README.md` for API documentation.

## Artifact Format

Each stage produces a markdown artifact with:

```markdown
# Plan

**Task:** Build API

## Context from Proposal
...

## Technical Approach
[Agent fills in]

## Confidence Assessment
[Agent self-assesses 1-10]
```

## Confidence Scoring

Agents assign a confidence score (1-10) after completing each stage:

- **10**: Completely unambiguous, no assumptions needed
- **5**: Some ambiguity, reasonable assumptions
- **1**: Highly ambiguous, many assumptions required

When confidence is low and multiple solutions exist, agents create branches.

## License

MIT
