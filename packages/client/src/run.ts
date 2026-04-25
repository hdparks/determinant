#!/usr/bin/env node

import { DeterminantClient } from './client/index.js';
import { Node } from './node/Node.js';
import { NotificationService } from './notifications/index.js';
import { resolve } from 'path';

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
      flags[key.toLowerCase()] = value ?? true;
      return false;
    }
    return true;
  });

  return { command, args: filtered, flags };
}

/**
 * Resolves the working directory for task execution
 * - If workingDir is absolute, uses it as-is
 * - If workingDir is relative, resolves against process.cwd()
 * - If workingDir is null/undefined, uses process.cwd()
 */
function resolveWorkingDir(workingDir: string | null | undefined): string {
  if (!workingDir) {
    return process.cwd();
  }
  
  // Check if path is absolute
  if (workingDir.startsWith('/')) {
    return workingDir;
  }
  
  // Resolve relative path against current working directory
  return resolve(process.cwd(), workingDir);
}

async function cmdWork(client: DeterminantClient, ttlSeconds: number = 3600) {
  const startTime = Date.now();
  const ttl = ttlSeconds * 1000; // Convert to milliseconds
  let processed = 0;
  let errors = 0;
  let exitReason: 'ttl_expired' | 'queue_empty' | 'unknown' = 'unknown';

  // Initialize notification service
  const notifications = new NotificationService({
    verbose: false,  // Keep notifications quiet by default
  });

  console.log(`🚀 Worker started (TTL: ${ttlSeconds}s)\n`);
  await notifications.notifyWorkerStarted();

  while (Date.now() - startTime < ttl) {
    // Get next highest priority item from queue
    const { items } = await client.getQueue(1);
    
    if (items.length === 0) {
      // Queue empty - exit immediately
      exitReason = 'queue_empty';
      await notifications.notifyQueueEmpty();
      break;
    }

    const item = items[0];
    
    try {
      // Resolve working directory
      const workingDir = resolveWorkingDir(item.task.workingDir);
      
      // Create Node instance with custom workingDir
      const node = await Node.create(item.node, client, { workingDir });
      
      // Process node (calls OpenCode, generates artifact)
      const result = await node.process();
      
      // Atomically complete processing: create child node + mark parent as processed
      // This replaces the previous two-step approach to ensure atomicity
      await client.completeNodeProcessing(item.node.id, {
        toStage: result.childNode.toStage,
        content: result.childNode.content,
        confidenceBefore: result.childNode.confidenceBefore,
        confidenceAfter: result.childNode.confidenceAfter,
      });
      
      // Minimal logging: task_vibe | FromStage → ToStage
      const taskPreview = item.task.vibe.length > 50 
        ? item.task.vibe.slice(0, 50) + '...'
        : item.task.vibe;
      console.log(`✅ ${taskPreview} | ${node.toStage} → ${result.childNode.toStage}`);
      
      // Send notification for node completion
      await notifications.notifyNodeComplete(item.node.id, result.childNode.toStage);
      
      processed++;
      
    } catch (error) {
      const err = error as Error;
      console.error(`❌ Failed processing ${item.node.toStage} node ${item.node.id}: ${err.message}`);
      await notifications.notifyError(`Node processing failed: ${item.node.id.slice(-8)}`, err);
      errors++;
      // Continue to next item
    }
  }

  // Check if we exited due to TTL expiration
  if (exitReason === 'unknown') {
    exitReason = 'ttl_expired';
  }

  // Final statistics
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n📊 Processed: ${processed} | Errors: ${errors} | Time: ${elapsed}s`);
  
  // Send appropriate completion notification
  if (exitReason === 'ttl_expired') {
    await notifications.notifyTTLExpired(ttlSeconds, processed);
  }
  
  // Send worker completion notification
  await notifications.notifyWorkerComplete(processed);
}

async function cmdHelp() {
  console.log(`
boblin - Agent worker

Usage: boblin <command> [options]

Commands:
  work                    Start processing tasks from queue
  help                    Show this help

Options:
  --ttl=<seconds>         Time-to-live in seconds (default: 3600)

Examples:
  boblin work                    # Process queue for 1 hour (default)
  boblin work --ttl=1800         # Process queue for 30 minutes
  boblin work --ttl=7200         # Process queue for 2 hours

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
    case 'work':
    case 'w':
      {
        const ttl = args.flags.ttl ? parseInt(args.flags.ttl as string, 10) : 3600;
        await cmdWork(client, ttl);
      }
      break;
    case 'help':
    case '-h':
    case '--help':
      await cmdHelp();
      break;
    default:
      console.log(`Unknown command: ${args.command}`);
      console.log('Run "det run help" for usage');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});