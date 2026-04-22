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

This is a monorepo with three packages:

- **`packages/server`** - Express API server with SQLite database
- **`packages/client`** - CLI tool for interacting with the server
- **`packages/types`** - Shared TypeScript types

## Quick Start

```bash
# Install all dependencies
npm install

# Build all packages
npm run build

# Run the server
npm run dev:server

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
