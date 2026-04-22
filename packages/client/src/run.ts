#!/usr/bin/env node

import { DeterminantClient } from './client/index.js';

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

async function cmdWork(client: DeterminantClient) {
  // TODO: agent should loop until time-to-live runs out
  // TODO: agent should get the next node from the queue (via getQueue)
  // TODO: given an existing task, agent should be prompted with enough information to 1. perform the task at hand, and 2. return the necessary artifact
}

// TODO: Add a time-to-live for a given agent (make sure it doesn't just keep eating all the money)
async function cmdHelp() {
  console.log(`
determinant-run - Agent worker

Usage: det run <command> [options]

Commands:
  work                    Start processing tasks from queue
  help                    Show this help

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
      await cmdWork(client);
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