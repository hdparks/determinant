# Determinant

Agentic workflow pipeline with task prioritization and confidence scoring.

## Overview

Determinant is a lightweight task management system designed for agentic workflows. Tasks progress linearly through stages, with each stage producing a markdown artifact that provides context for the next stage.

### Workflow Stages

```
Proposed → Planned → Executed → Verified → Released
```

### Key Features

- **Linear task progression** - Tasks move through stages with markdown artifacts at each transition
- **Confidence scoring** - Agents self-assess their work (1-10) based on ambiguity and assumptions made
- **Branching** - When multiple valid solutions exist, agents can create branches with tradeoff explanations
- **Priority heap queue** - Configurable heuristics for task prioritization
- **Agent claiming** - Optimistic locking to prevent concurrent work on same task
- **Siloed agents** - Each agent works independently without inter-agent communication

## Quick Start

```bash
# Install
npm install

# Build
npm run build

# Create a task
node dist/cli.js add "Implement user authentication"

# List tasks
node dist/cli.js list

# View queue
node dist/cli.js queue Proposed

# Get task details
node dist/cli.js get <task-id>
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `add <title>` | Create a new task |
| `list [state]` | List tasks (optionally by state) |
| `get <id>` | Get task details with artifacts |
| `queue [state]` | Show priority queue |
| `set-state <id> <state>` | Manually set task state |
| `heap-config [--set=...]` | Configure heap weights |

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
node dist/cli.js heap-config

# Adjust weights (values should sum to 1.0)
node dist/cli.js heap-config --set=priorityWeight=0.7,confidenceWeight=0.3,manualWeight=0.0
```

## Programmatic Usage

```typescript
import { initDb, createTask, getTasksByState } from './index.js';
import { getHeap } from './heap.js';
import { BaseAgent, createLLMClient, AgentConfig } from './agents/base.js';

// Initialize
initDb('./determinant.db');

// Create task
const task = createTask('Build API endpoint', 'Description here', 2);

// Get next task from queue
const heap = getHeap();
const nextTaskId = heap.getNextTask('Proposed');

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

## Artifact Format

Each stage produces a markdown artifact with:

```markdown
# Planned

**Task:** Build API

## Context from Proposed
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
