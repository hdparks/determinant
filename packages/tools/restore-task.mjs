#!/usr/bin/env node

/**
 * Restore Task from Artifacts
 * 
 * Recovers a task from its artifact files when the database has been cleared or corrupted.
 * This tool recreates the task and all its historical nodes from the markdown artifacts.
 * 
 * Usage:
 *   node packages/tools/restore-task.mjs <task-id> [options]
 * 
 * Options:
 *   --working-dir=<path>   Override working directory for the restored task
 *   --db-path=<path>       Path to database file (default: packages/server/determinant.db)
 *   --dry-run              Show what would be restored without making changes
 * 
 * Example:
 *   node packages/tools/restore-task.mjs 01KPY76T3HHHDPAGR55RSDGPCS
 */

import { readFile, access } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const taskId = args[0];
const options = {
  workingDir: null,
  dbPath: null,
  dryRun: false
};

// Parse flags
for (const arg of args.slice(1)) {
  if (arg.startsWith('--working-dir=')) {
    options.workingDir = arg.split('=')[1];
  } else if (arg.startsWith('--db-path=')) {
    options.dbPath = arg.split('=')[1];
  } else if (arg === '--dry-run') {
    options.dryRun = true;
  }
}

if (!taskId || taskId.startsWith('--')) {
  console.error('❌ Error: Task ID is required\n');
  console.log('Usage: node packages/tools/restore-task.mjs <task-id> [options]\n');
  console.log('Options:');
  console.log('  --working-dir=<path>   Override working directory for the restored task');
  console.log('  --db-path=<path>       Path to database file (default: packages/server/determinant.db)');
  console.log('  --dry-run              Show what would be restored without making changes\n');
  console.log('Example:');
  console.log('  node packages/tools/restore-task.mjs 01KPY76T3HHHDPAGR55RSDGPCS');
  process.exit(1);
}

// Stage order for the workflow
const STAGE_ORDER = ['Proposal', 'Questions', 'Research', 'Plan', 'Implement', 'Validate', 'Released'];

async function findArtifacts(taskId) {
  const artifacts = {};
  
  // Search common locations for artifacts
  const searchPaths = [
    `./packages/client/.determinant/artifacts/${taskId}`,
    `./.determinant/artifacts/${taskId}`,
    `./artifacts/${taskId}`
  ];
  
  for (const basePath of searchPaths) {
    try {
      await access(basePath);
      console.log(`📂 Found artifacts at: ${basePath}\n`);
      
      // Try to load each stage's artifact
      for (const stage of STAGE_ORDER) {
        const filename = `${stage.toLowerCase()}.md`;
        const filepath = join(basePath, filename);
        
        try {
          await access(filepath);
          const content = await readFile(filepath, 'utf-8');
          artifacts[stage] = {
            path: filepath,
            content
          };
          console.log(`  ✓ Found ${stage} artifact`);
        } catch (err) {
          // This stage doesn't exist yet
        }
      }
      
      // If we found any artifacts in this location, use it
      if (Object.keys(artifacts).length > 0) {
        return { artifacts, basePath };
      }
    } catch (err) {
      // This path doesn't exist, try next
      continue;
    }
  }
  
  throw new Error(`No artifact directory found for task ${taskId}. Searched: ${searchPaths.join(', ')}`);
}

function parseProposal(content) {
  const lines = content.split('\n');
  
  let vibe = '';
  const pins = [];
  const hints = [];
  
  let currentSection = null;
  
  for (const line of lines) {
    if (line.startsWith('# Vibe')) {
      currentSection = 'vibe';
      continue;
    } else if (line.startsWith('## Pins')) {
      currentSection = 'pins';
      continue;
    } else if (line.startsWith('## Hints')) {
      currentSection = 'hints';
      continue;
    }
    
    if (currentSection === 'vibe' && line.trim() && !line.startsWith('#')) {
      vibe = line.trim();
    } else if (currentSection === 'pins' && line.trim().startsWith('-')) {
      pins.push(line.trim().substring(1).trim());
    } else if (currentSection === 'hints' && line.trim().startsWith('-')) {
      hints.push(line.trim().substring(1).trim());
    }
  }
  
  return { vibe, pins, hints };
}

function inferConfidenceScores(stage, index, total) {
  // Default confidence progression
  const baseScores = {
    'Proposal': [null, null],
    'Questions': [7, 8],
    'Research': [8, 9],
    'Plan': [9, 9],
    'Implement': [9, 9],
    'Validate': [9, null], // After is set when processed
  };
  
  return baseScores[stage] || [8, 9];
}

async function main() {
  console.log('🔄 Restoring task from artifacts...\n');
  console.log(`Task ID: ${taskId}`);
  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  // Find and load artifacts
  const { artifacts, basePath } = await findArtifacts(taskId);
  
  if (Object.keys(artifacts).length === 0) {
    throw new Error('No artifacts found to restore from');
  }
  
  console.log(`\n📊 Found ${Object.keys(artifacts).length} artifacts to restore\n`);
  
  // Parse proposal to get task metadata
  if (!artifacts.Proposal) {
    throw new Error('Proposal artifact is required but not found');
  }
  
  const { vibe, pins, hints } = parseProposal(artifacts.Proposal.content);
  
  if (!vibe) {
    throw new Error('Could not parse vibe from Proposal artifact');
  }
  
  console.log('📝 Task Details:');
  console.log(`  Vibe: ${vibe}`);
  console.log(`  Pins: ${pins.length}`);
  console.log(`  Hints: ${hints.length}`);
  
  // Determine working directory
  let workingDir = options.workingDir;
  if (!workingDir) {
    // Try to infer from artifact path
    if (basePath.includes('packages/client')) {
      workingDir = './packages/client';
    } else {
      workingDir = null;
    }
  }
  
  if (workingDir) {
    console.log(`  Working Dir: ${workingDir}`);
  }
  console.log('');
  
  if (options.dryRun) {
    console.log('✅ Dry run complete. Task would be restored with the following nodes:');
    Object.keys(artifacts).forEach((stage, idx) => {
      const [before, after] = inferConfidenceScores(stage, idx, Object.keys(artifacts).length);
      const isLast = idx === Object.keys(artifacts).length - 1;
      console.log(`  ${isLast ? '⏳' : '✓'} ${stage} (confidence: ${before ?? 'N/A'} → ${after ?? 'N/A'})`);
    });
    console.log('\nRun without --dry-run to actually restore the task.');
    return;
  }
  
  // Import server functions
  const serverPath = new URL('../server/dist/task-store.js', import.meta.url);
  const dbPath = new URL('../server/dist/db.js', import.meta.url);
  
  const { createTask, createNode, getNodesByTask } = await import(serverPath.href);
  const { initDb, getDb } = await import(dbPath.href);
  
  // Initialize database
  const dbFilePath = options.dbPath || new URL('../server/determinant.db', import.meta.url).pathname;
  initDb(dbFilePath);
  console.log(`✓ Connected to database: ${dbFilePath}\n`);
  
  // Create the task (this auto-creates a Proposal node)
  console.log(`📝 Creating task...`);
  const task = createTask(vibe, pins, hints, 3, workingDir);
  console.log(`✓ Task created: ${task.id}\n`);
  
  // Get the auto-created Proposal node
  const nodes = getNodesByTask(task.id);
  const proposalNode = nodes.find(n => n.toStage === 'Proposal');
  
  if (!proposalNode) {
    throw new Error('Proposal node was not auto-created!');
  }
  
  // Update the Proposal node content from artifact
  const db = getDb();
  db.prepare('UPDATE nodes SET content = ? WHERE id = ?')
    .run(artifacts.Proposal.content, proposalNode.id);
  
  console.log(`✓ Proposal node: ${proposalNode.id} (updated with artifact content)`);
  
  // Create remaining nodes in order
  let previousNode = proposalNode;
  let previousStage = 'Proposal';
  const createdNodes = [proposalNode];
  
  for (const stage of STAGE_ORDER.slice(1)) { // Skip Proposal since it's already created
    if (!artifacts[stage]) {
      break; // Stop at first missing stage
    }
    
    const [confidenceBefore, confidenceAfter] = inferConfidenceScores(stage, createdNodes.length, Object.keys(artifacts).length);
    
    console.log(`Creating ${stage} node...`);
    const node = createNode(
      task.id,
      stage,
      artifacts[stage].content,
      previousNode.id,
      previousStage,
      confidenceBefore,
      confidenceAfter
    );
    console.log(`✓ ${stage} node: ${node.id}`);
    
    createdNodes.push(node);
    previousNode = node;
    previousStage = stage;
  }
  
  // Determine which is the next unprocessed stage
  const nextStageIndex = STAGE_ORDER.indexOf(previousStage) + 1;
  const hasNextStage = nextStageIndex < STAGE_ORDER.length && !artifacts[STAGE_ORDER[nextStageIndex]];
  
  if (hasNextStage) {
    // Create the next stage node as unprocessed
    const nextStage = STAGE_ORDER[nextStageIndex];
    const [confidenceBefore, confidenceAfter] = inferConfidenceScores(nextStage, createdNodes.length, createdNodes.length + 1);
    
    console.log(`\nCreating ${nextStage} node (unprocessed)...`);
    const nextNode = createNode(
      task.id,
      nextStage,
      '', // Empty content - needs processing
      previousNode.id,
      previousStage,
      confidenceBefore,
      confidenceAfter
    );
    console.log(`✓ ${nextStage} node: ${nextNode.id} (ready for processing)`);
    createdNodes.push(nextNode);
  }
  
  // Mark all historical nodes as processed (except the last one)
  console.log('\nMarking historical nodes as processed...');
  const processedStages = createdNodes.slice(0, -1).map(n => n.toStage);
  db.prepare(`
    UPDATE nodes 
    SET processed_at = created_at 
    WHERE task_id = ? AND to_stage IN (${processedStages.map(() => '?').join(',')})
  `).run(task.id, ...processedStages);
  console.log('✓ Historical nodes marked as processed\n');
  
  console.log('✅ Task restoration complete!\n');
  console.log('Summary:');
  console.log(`  Task ID: ${task.id}`);
  console.log(`  Current State: ${task.state}`);
  console.log(`  Restored Stages: ${processedStages.join(' → ')}`);
  
  if (hasNextStage) {
    const nextStage = createdNodes[createdNodes.length - 1].toStage;
    console.log(`  Next Stage: ${nextStage} (node ${createdNodes[createdNodes.length - 1].id})`);
    console.log('\n💡 The worker can now pick up this node and continue processing.\n');
  } else {
    console.log('\n✓ All stages have been restored. Task is complete.\n');
  }
}

main().catch(err => {
  console.error('❌ Error restoring task:', err.message);
  if (err.stack) {
    console.error('\nStack trace:');
    console.error(err.stack);
  }
  process.exit(1);
});
