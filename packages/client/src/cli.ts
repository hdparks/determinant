#!/usr/bin/env node

import { DeterminantClient } from './client/index.js';
import { TaskState, TASK_STATES } from '@determinant/types';

interface CliArgs {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(args: string[]): CliArgs {
  const command = args[0] ?? 'help';
  const rest = args.slice(1);
  const flags: Record<string, string | boolean> = {};

  const filtered = rest.filter((arg) => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      flags[key] = value ?? true;
      return false;
    }
    return true;
  });

  return { command, args: filtered, flags };
}

async function cmdList(client: DeterminantClient, args: CliArgs) {
  const state = args.args[0] as TaskState | undefined;
  const result = await client.listTasks(state);

  if (result.tasks.length === 0) {
    console.log('No tasks found');
    return;
  }

  console.log(`\nTasks (${result.tasks.length}):\n`);
  for (const task of result.tasks) {
    console.log(`  ${task.id.slice(-8)} | ${task.state.padEnd(10)} | pri:${task.priority} | ${task.title}`);
  }
}

async function cmdAdd(client: DeterminantClient, args: CliArgs) {
  const title = args.args.join(' ');
  const priority = args.flags.priority ? parseInt(String(args.flags.priority), 10) : 3;

  if (!title) {
    console.error('Error: Title required');
    console.error('Usage: det add "<title>" [--priority=1-5]');
    process.exit(1);
  }

  const result = await client.createTask({ title, priority });
  const task = result.task;

  console.log(`Created task: ${task.id}`);
  console.log(`  Title: ${task.title}`);
  console.log(`  Priority: ${task.priority}`);
  console.log(`  State: ${task.state}`);
}

async function cmdGet(client: DeterminantClient, args: CliArgs) {
  const id = args.args[0];

  if (!id) {
    console.error('Error: Task ID required');
    console.error('Usage: det get <task-id>');
    process.exit(1);
  }

  const result = await client.getTask(id);
  const full = result;

  console.log(`\n## Task: ${full.task.title}`);
  console.log(`ID: ${full.task.id}`);
  console.log(`State: ${full.task.state}`);
  console.log(`Priority: ${full.task.priority}`);
  console.log(`Created: ${full.task.createdAt}`);
  console.log(`Updated: ${full.task.updatedAt}`);

  if (full.nodes.length > 0) {
    console.log(`\n## Nodes (${full.nodes.length}):`);
    for (const node of full.nodes) {
      console.log(`\n### ${node.toStage}`);
      console.log(`ID: ${node.id}`);
      console.log(`Confidence: ${node.confidenceBefore ?? 'N/A'} → ${node.confidenceAfter ?? 'N/A'}`);
      console.log(node.content.slice(0, 300) + (node.content.length > 300 ? '...' : ''));
    }
  }
}

async function cmdQueue(client: DeterminantClient, args: CliArgs) {
  const state = (args.args[0] as TaskState) || 'Proposed';
  const limit = args.flags.limit ? parseInt(String(args.flags.limit), 10) : 10;

  if (!TASK_STATES.includes(state)) {
    console.error(`Invalid state. Valid: ${TASK_STATES.join(', ')}`);
    process.exit(1);
  }

  const result = await client.getQueue(state, limit);

  if (result.items.length === 0) {
    console.log(`No tasks in ${state} queue`);
    return;
  }

  console.log(`\nQueue for ${state} (sorted by priority):\n`);
  for (const item of result.items) {
    console.log(`  ${item.task.id.slice(-8)} | score:${item.score.toFixed(2)} | conf:${item.confidence ?? 'N/A'} | ${item.task.title}`);
  }
}

async function cmdSetState(client: DeterminantClient, args: CliArgs) {
  const id = args.args[0];
  const newState = args.args[1] as TaskState;

  if (!id || !newState) {
    console.error('Usage: det set-state <task-id> <state>');
    process.exit(1);
  }

  if (!TASK_STATES.includes(newState)) {
    console.error(`Invalid state. Valid: ${TASK_STATES.join(', ')}`);
    process.exit(1);
  }

  try {
    const result = await client.updateTaskState(id, { state: newState });
    console.log(`Updated task ${id} to ${result.task.state}`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

async function cmdHeapConfig(client: DeterminantClient, args: CliArgs) {
  if (args.flags.set) {
    const setVal = String(args.flags.set);
    const parts = setVal.split(',');
    const updates: Record<string, number> = {};
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 'priorityWeight' || key === 'confidenceWeight' || key === 'manualWeight') {
        updates[key] = parseFloat(value);
      }
    }
    const result = await client.updateHeapConfig(updates);
    console.log('Updated heap config');
    console.log(`  priorityWeight: ${result.config.priorityWeight}`);
    console.log(`  confidenceWeight: ${result.config.confidenceWeight}`);
    console.log(`  manualWeight: ${result.config.manualWeight}`);
  } else {
    const result = await client.getHeapConfig();
    console.log('\nHeap Configuration:');
    console.log(`  priorityWeight: ${result.config.priorityWeight}`);
    console.log(`  confidenceWeight: ${result.config.confidenceWeight}`);
    console.log(`  manualWeight: ${result.config.manualWeight}`);
  }
}

async function cmdHelp() {
  console.log(`
determinant - Agentic workflow pipeline

Usage: det <command> [options]

Commands:
  add <title>               Create a new task
  list [state]              List tasks (optionally by state)
  get <task-id>             Get task details with nodes
  queue [state]             Show priority queue for state
  set-state <id> <state>   Manually set task state
  heap-config [--set=...]   Show/update heap configuration
  help                    Show this help

Options:
  --priority=1-5           Set task priority (1 highest, 5 lowest)
  --state=<state>           Filter by state
  --limit=N                 Limit results
  --set=key=value,...       Set heap config values

Examples:
  det add "Implement login flow"
  det list Proposed
  det get 01ABC...
  det queue Proposed
  det set-state 01ABC... Executed
  det heap-config --set=priorityWeight=0.7,confidenceWeight=0.3

States: ${TASK_STATES.join(', ')}
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const baseUrl = process.env.DETERMINANT_SERVER_URL ?? 'http://localhost:10110';
  const apiKey = process.env.DETERMINANT_API_KEY ?? '';

  const client = new DeterminantClient({ baseUrl, apiKey });

  try {
    await client.health();
  } catch {
    console.error(`Error: Cannot connect to server at ${baseUrl}`);
    console.error('Make sure the server is running and DETERMINANT_API_KEY is set');
    process.exit(1);
  }

  switch (args.command) {
    case 'list':
    case 'ls':
      await cmdList(client, args);
      break;
    case 'add':
    case 'create':
      await cmdAdd(client, args);
      break;
    case 'get':
    case 'show':
      await cmdGet(client, args);
      break;
    case 'queue':
    case 'q':
      await cmdQueue(client, args);
      break;
    case 'set-state':
      await cmdSetState(client, args);
      break;
    case 'heap-config':
      await cmdHeapConfig(client, args);
      break;
    case 'help':
    case '-h':
    case '--help':
      await cmdHelp();
      break;
    default:
      console.log(`Unknown command: ${args.command}`);
      console.log('Run "det help" for usage');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});