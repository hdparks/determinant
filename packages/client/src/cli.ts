#!/usr/bin/env node

import { resolve } from 'path';
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
      // Convert kebab-case to camelCase for working-dir and depends-on
      const flagKey = key === 'working-dir' ? 'workingDir' 
                    : key === 'depends-on' ? 'dependsOn'
                    : key;
      flags[flagKey] = value ?? true;
      return false;
    }
    // Handle short flags like -y
    if (arg.startsWith('-') && !arg.startsWith('--')) {
      const shortFlag = arg.slice(1);
      flags[shortFlag] = true;
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
    console.log(`  ${task.id} | ${task.state.padEnd(10)} | pri:${task.priority} | ${task.vibe}`);
  }
}

async function cmdAdd(client: DeterminantClient, args: CliArgs) {
  const vibe = args.flags.vibe ? String(args.flags.vibe) : args.args.join(' ');
  const priority = args.flags.priority ? parseInt(String(args.flags.priority), 10) : 3;
  
  // Validate priority if provided
  if (args.flags.priority !== undefined && (isNaN(priority) || priority < 1 || priority > 5)) {
    console.error('Error: Priority must be a number between 1 and 5');
    console.error('Usage: det add "<vibe>" --priority=1-5');
    process.exit(1);
  }
  
  // Default to current working directory, or resolve provided path
  const workingDir = args.flags.workingDir 
    ? resolve(String(args.flags.workingDir))
    : process.cwd();
  
  // Extract dependsOn flag
  const dependsOnTaskId = args.flags.dependsOn 
    ? String(args.flags.dependsOn)
    : undefined;
  
  const pinsRaw = args.flags.pin;
  const hintsRaw = args.flags.hint;
  
  const pins = Array.isArray(pinsRaw) ? pinsRaw.filter((p): p is string => typeof p === 'string') : 
               (pinsRaw && typeof pinsRaw === 'string' ? [pinsRaw] : []);
  const hints = Array.isArray(hintsRaw) ? hintsRaw.filter((h): h is string => typeof h === 'string') : 
                (hintsRaw && typeof hintsRaw === 'string' ? [hintsRaw] : []);

  if (!vibe) {
    console.error('Error: Vibe required');
    console.error('Usage: det add --vibe="..." [--pin="..." --hint="..." --priority=1-5 --working-dir="/path" --depends-on=<task-id>]');
    console.error('   or: det add "<vibe>" [--pin="..." --hint="..." --priority=1-5 --working-dir="/path" --depends-on=<task-id>]');
    process.exit(1);
  }

  // Validate working directory exists (non-blocking warning)
  if (workingDir) {
    const { access, constants } = await import('fs/promises');
    try {
      await access(workingDir, constants.R_OK);
    } catch {
      console.warn(`⚠️  Warning: Working directory does not exist or is not readable: ${workingDir}`);
      console.warn(`   Task will be created but may fail during execution.`);
    }
  }

  const result = await client.createTask({ vibe, pins, hints, priority, workingDir, dependsOnTaskId });
  const task = result.task;

  console.log(`Created task: ${task.id}`);
  console.log(`  Vibe: ${task.vibe}`);
  console.log(`  Priority: ${task.priority}`);
  console.log(`  State: ${task.state}`);
  if (task.workingDir) {
    console.log(`  Working Dir: ${task.workingDir}`);
  }
  if (task.dependsOnTaskId) {
    console.log(`  Depends On: ${task.dependsOnTaskId}`);
  }
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
  if (full.task.workingDir) {
    console.log(`Working Dir: ${full.task.workingDir}`);
  }
  if (full.task.dependsOnTaskId) {
    console.log(`Depends On: ${full.task.dependsOnTaskId}`);
  }
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

async function cmdSetWeight(client: DeterminantClient, args: CliArgs) {
  const id = args.args[0];
  const weightStr = args.args[1];

  if (!id || weightStr === undefined) {
    console.error('Usage: det set-weight <task-id> <weight>');
    process.exit(1);
  }

  const weight = parseFloat(weightStr);
  if (!Number.isFinite(weight)) {
    console.error('Error: Weight must be a valid number');
    process.exit(1);
  }

  try {
    const result = await client.updateTaskManualWeight(id, { manualWeight: weight });
    console.log(`Updated task ${id} manual weight to ${result.task.manualWeight}`);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

async function cmdDelete(client: DeterminantClient, args: CliArgs) {
  const id = args.args[0];

  if (!id) {
    console.error('Usage: det delete <task-id> [--yes]');
    console.error('       det delete <task-id> -y');
    process.exit(1);
  }

  // Fetch task details for confirmation message
  let task;
  try {
    const result = await client.getTask(id);
    task = result.task;
  } catch (err) {
    console.error(`Error: Task ${id} not found`);
    process.exit(1);
  }

  // Show task details
  console.log(`\nTask to delete:`);
  console.log(`  ID: ${task.id}`);
  console.log(`  Vibe: ${task.vibe}`);
  console.log(`  State: ${task.state}`);
  console.log(`  Priority: ${task.priority}`);
  
  // Check for dependents
  const dependentsResult = await client.getDependents(id);
  if (dependentsResult.dependents.length > 0) {
    console.log(`\n⚠️  Warning: ${dependentsResult.dependents.length} task(s) depend on this task:`);
    for (const dep of dependentsResult.dependents) {
      console.log(`    - ${dep.id.slice(-8)}: ${dep.vibe}`);
    }
    console.log(`\nThese tasks will have their dependency cleared.`);
  }

  // Confirmation check
  const hasYesFlag = args.flags.yes || args.flags.y;
  if (!hasYesFlag) {
    console.error(`\n❌ Deletion cancelled. Use --yes or -y to confirm deletion.`);
    process.exit(1);
  }

  // Perform deletion
  try {
    await client.deleteTask(id);
    console.log(`\n✅ Task ${id} deleted successfully`);
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

async function cmdCleanup(client: DeterminantClient, args: CliArgs) {
  const shouldFix = args.flags.fix === true;

  console.log('\n🔍 Scanning for orphaned nodes...\n');

  // Detect orphaned nodes
  const orphanedResult = await client.detectOrphanedNodes();
  
  if (orphanedResult.count === 0) {
    console.log('✅ No orphaned nodes found!\n');
  } else {
    console.log(`⚠️  Found ${orphanedResult.count} orphaned node(s):\n`);
    for (const node of orphanedResult.orphanedNodes) {
      const nodeIdShort = node.nodeId.slice(-8);
      const taskIdShort = node.taskId.slice(-8);
      console.log(`  ${nodeIdShort} | task:${taskIdShort} | ${node.toStage}`);
    }
    console.log();

    if (shouldFix) {
      console.log('🔧 Fixing orphaned nodes...\n');
      const nodeIds = orphanedResult.orphanedNodes.map(n => n.nodeId);
      const fixResult = await client.fixOrphanedNodes(nodeIds);
      console.log(`✅ Fixed ${fixResult.fixed} of ${fixResult.requested} orphaned nodes\n`);
    } else {
      console.log('💡 Run with --fix to mark these nodes as processed\n');
    }
  }

  // Detect duplicate children
  console.log('🔍 Scanning for duplicate children...\n');
  const duplicateResult = await client.detectDuplicateChildren();
  
  if (duplicateResult.count === 0) {
    console.log('✅ No duplicate children found!\n');
  } else {
    console.log(`⚠️  Found ${duplicateResult.count} duplicate group(s):\n`);
    for (const dup of duplicateResult.duplicates) {
      const parentIdShort = dup.parentNodeId.slice(-8);
      const taskIdShort = dup.taskId.slice(-8);
      console.log(`  Parent ${parentIdShort} | task:${taskIdShort} | ${dup.toStage} | ${dup.count} duplicates`);
      for (const childId of dup.nodeIds) {
        console.log(`    - ${childId.slice(-8)}`);
      }
    }
    console.log();
    console.log('💡 Duplicates require manual review. Identify which child to keep and delete others.\n');
  }
}

async function cmdNotifyConfig(args: CliArgs) {
  const { NotificationService } = await import('./notifications/index.js');
  const notifications = new NotificationService();
  
  if (args.flags.test) {
    const type = args.flags.test as string;
    console.log(`Testing ${type} notification...`);
    await notifications.notify(type as any, { message: 'Test notification' });
    console.log('Notification sent!');
    return;
  }
  
  const config = notifications.getConfig();
  console.log('\nNotification Configuration:\n');
  console.log(`  Enabled: ${config.enabled}`);
  console.log(`  Sound Enabled: ${config.soundEnabled}`);
  console.log(`  Volume: ${config.volume}`);
  console.log(`  Verbose: ${config.verbose}`);
  console.log('\nSound Paths:');
  for (const [type, path] of Object.entries(config.sounds)) {
    console.log(`  ${type}: ${path || '(not set)'}`);
  }
  console.log();
}

async function cmdHelp() {
  console.log(`
determinant - Agentic workflow pipeline

Usage: det <command> [options]

Commands:
  add --vibe="..."          Create a new task with vibe (goal/user story)
  list [state]              List tasks (optionally by state)
  get <task-id>             Get task details with nodes
  delete <task-id> [--yes]  Delete a task (requires --yes flag)
  queue                     Show priority queue of nodes
  set-state <id> <state>   Manually set task state
  set-weight <id> <weight> Set manual weight for task priority
  heap-config [--set=...]   Show/update heap configuration
  cleanup [--fix]           Detect and optionally fix orphaned nodes
  notify-config             Show notification settings
  help                    Show this help

Options:
  --vibe="..."             Task vibe (thesis/goal statement) [required for add]
  --pin="..."              Acceptance criteria (can be repeated)
  --hint="..."             Additional context (can be repeated)
  --priority=1-5           Set task priority (1 highest, 5 lowest)
  --working-dir="/path"    Working directory for task execution (defaults to current directory)
  --depends-on=<task-id>   Task dependency - this task will wait for the specified task to complete
  --state=<state>           Filter by state
  --limit=N                 Limit results
  --set=key=value,...       Set heap config values
  --fix                     Fix detected issues (for cleanup command)
  --yes, -y                 Confirm destructive operations (for delete)

Examples:
  det add --vibe="Implement login flow" --pin="Use JWT" --pin="Support OAuth" --hint="Check auth.ts"
  det add "Quick task vibe" --priority=1
  det add --vibe="Fix auth bug" --working-dir="./packages/server"
  det add --vibe="Deploy to prod" --depends-on=01ABC123 --priority=1
  det list Proposal
  det get 01ABC...
  det delete 01ABC... --yes    # Delete task with confirmation
  det rm 01ABC... -y           # Delete task (shorthand)
  det queue --limit=20
  det set-state 01ABC... Implement
  det set-weight 01ABC... 10
  det heap-config --set=priorityWeight=0.7,confidenceWeight=0.3
  det cleanup               # Detect orphaned nodes (dry-run)
  det cleanup --fix         # Fix orphaned nodes

States: ${TASK_STATES.join(', ')}
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("got these args:", args)
  console.log("from these:", process.argv)

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
    case 'set-weight':
      await cmdSetWeight(client, args);
      break;
    case 'delete':
    case 'rm':
      await cmdDelete(client, args);
      break;
    case 'heap-config':
      await cmdHeapConfig(client, args);
      break;
    case 'cleanup':
      await cmdCleanup(client, args);
      break;
    case 'notify-config':
    case 'notifications':
      await cmdNotifyConfig(args);
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