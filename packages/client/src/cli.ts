#!/usr/bin/env node

import { DeterminantClient } from './client/index.js';
import { TaskState, TASK_STATES } from '@determinant/types';

interface CliArgs {
  command: string;
  args: string[];
  flags: Record<string, string | boolean | string[]>;
}

function parseArgs(args: string[]): CliArgs {
  const command = args[0] ?? 'help';
  const rest = args.slice(1);
  const flags: Record<string, string | boolean | string[]> = {};

  const filtered = rest.filter((arg) => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      // Handle repeatable flags (pin, hint)
      if (key === 'pin' || key === 'hint') {
        if (!flags[key]) {
          flags[key] = [];
        }
        (flags[key] as string[]).push(value);
        return false;
      }
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
    console.log(`  ${task.id.slice(-8)} | ${task.state.padEnd(10)} | pri:${task.priority} | ${task.vibe}`);
  }
}

async function cmdAdd(client: DeterminantClient, args: CliArgs) {
  const vibe = args.flags.vibe ? String(args.flags.vibe) : args.args.join(' ');
  const priority = args.flags.priority ? parseInt(String(args.flags.priority), 10) : 3;
  const pinsRaw = args.flags.pin;
  const hintsRaw = args.flags.hint;
  
  const pins = Array.isArray(pinsRaw) ? pinsRaw.filter((p): p is string => typeof p === 'string') : 
               (pinsRaw && typeof pinsRaw === 'string' ? [pinsRaw] : []);
  const hints = Array.isArray(hintsRaw) ? hintsRaw.filter((h): h is string => typeof h === 'string') : 
                (hintsRaw && typeof hintsRaw === 'string' ? [hintsRaw] : []);

  if (!vibe) {
    console.error('Error: Vibe required');
    console.error('Usage: det add --vibe="..." [--pin="..." --hint="..." --priority=1-5]');
    console.error('   or: det add "<vibe>" [--pin="..." --hint="..." --priority=1-5]');
    process.exit(1);
  }

  const result = await client.createTask({ vibe, pins, hints, priority });
  const task = result.task;

  console.log(`Created task: ${task.id}`);
  console.log(`  Vibe: ${task.vibe}`);
  console.log(`  Priority: ${task.priority}`);
  console.log(`  State: ${task.state}`);
  if (task.pins.length > 0) {
    console.log(`  Pins:`);
    task.pins.forEach(pin => console.log(`    - ${pin}`));
  }
  if (task.hints.length > 0) {
    console.log(`  Hints:`);
    task.hints.forEach(hint => console.log(`    - ${hint}`));
  }
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

  console.log(`\n## Task: ${full.task.vibe}`);
  console.log(`ID: ${full.task.id}`);
  console.log(`State: ${full.task.state}`);
  console.log(`Priority: ${full.task.priority}`);
  console.log(`Created: ${full.task.createdAt}`);
  console.log(`Updated: ${full.task.updatedAt}`);
  
  if (full.task.pins.length > 0) {
    console.log(`\nPins:`);
    full.task.pins.forEach(pin => console.log(`  - ${pin}`));
  }
  
  if (full.task.hints.length > 0) {
    console.log(`\nHints:`);
    full.task.hints.forEach(hint => console.log(`  - ${hint}`));
  }
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
  const limit = args.flags.limit ? parseInt(String(args.flags.limit), 10) : 10;

  const result = await client.getQueue(limit);

  if (result.items.length === 0) {
    console.log('No nodes in queue');
    return;
  }

  console.log(`\nPriority Queue (top ${result.items.length} nodes):\n`);
  for (const item of result.items) {
    const nodeIdShort = item.node.id.slice(-8);
    const taskIdShort = item.task.id.slice(-8);
    const conf = item.confidence ?? 'N/A';
    const score = item.score.toFixed(2);
    console.log(`  ${nodeIdShort} | task:${taskIdShort} | ${item.node.toStage.padEnd(10)} | score:${score} | conf:${conf} | ${item.task.vibe.slice(0, 50)}`);
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
  add --vibe="..."          Create a new task with vibe (goal/user story)
  list [state]              List tasks (optionally by state)
  get <task-id>             Get task details with nodes
  queue                     Show priority queue of nodes
  set-state <id> <state>   Manually set task state
  heap-config [--set=...]   Show/update heap configuration
  help                    Show this help

Options:
  --vibe="..."             Task vibe (thesis/goal statement) [required for add]
  --pin="..."              Acceptance criteria (can be repeated)
  --hint="..."             Additional context (can be repeated)
  --priority=1-5           Set task priority (1 highest, 5 lowest)
  --state=<state>           Filter by state
  --limit=N                 Limit results
  --set=key=value,...       Set heap config values

Examples:
  det add --vibe="Implement login flow" --pin="Use JWT" --pin="Support OAuth" --hint="Check auth.ts"
  det add "Quick task vibe" --priority=1
  det list Proposed
  det get 01ABC...
  det queue --limit=20
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